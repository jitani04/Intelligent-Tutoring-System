from __future__ import annotations

import html
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.models.assignment import Assignment
from app.models.conversation import Conversation
from app.models.key_idea import KeyIdea
from app.models.lecture_note import LectureNote
from app.models.project_profile import ProjectProfile
from app.models.quiz import Quiz, QuizAttempt
from app.models.user import User


@dataclass(slots=True)
class ReviewDigest:
    subject: str | None
    reason: str
    email_subject: str
    focus_topics: list[str] = field(default_factory=list)
    key_notes: list[str] = field(default_factory=list)
    weak_areas: list[str] = field(default_factory=list)
    recommended_actions: list[str] = field(default_factory=list)
    outside_study_actions: list[str] = field(default_factory=list)
    links: list[dict[str, str]] = field(default_factory=list)
    upcoming_deadline: dict[str, str] | None = None
    text_body: str = ""
    html_body: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ReviewDigestService:
    def __init__(self, *, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def generate_digest(
        self,
        *,
        session: AsyncSession,
        user: User,
        subject: str | None,
        trigger_type: str = "manual",
    ) -> ReviewDigest:
        now = datetime.now(timezone.utc)
        clean_subject = subject.strip() if subject and subject.strip() else None
        assignments = await self._assignments(session=session, user_id=user.id, subject=clean_subject, now=now)
        notes = await self._notes(session=session, user_id=user.id, subject=clean_subject)
        profile = await self._profile(session=session, user_id=user.id, subject=clean_subject)
        weak_topics = await self._weak_topics(session=session, user_id=user.id, subject=clean_subject, profile=profile)
        quiz_misses = await self._recent_quiz_misses(session=session, user_id=user.id, subject=clean_subject)
        lectures = await self._recent_lectures(session=session, user_id=user.id, subject=clean_subject)

        due_cards = [note for note in notes if _as_aware(note.sr_due_date) <= now]
        upcoming = assignments[0] if assignments else None
        subject_label = clean_subject or "your studies"
        reason = self._reason(trigger_type=trigger_type, upcoming=upcoming, due_count=len(due_cards), weak_topics=weak_topics)
        focus_topics = _unique([
            *weak_topics,
            *quiz_misses,
            *[card.concept for card in due_cards[:4]],
            *self._learning_map_topics(profile),
        ])[:6]
        key_notes = [f"{note.concept}: {_short(note.summary, 170)}" for note in notes[:5]] if user.include_key_notes else []
        recommended_actions = [
            "Review your saved notes.",
            "Do 5 Sapient quiz questions on the weakest topic.",
            "Review due flashcards.",
        ]
        if lectures:
            recommended_actions.append("Use Lecture Mode for a quick recap.")
        if upcoming:
            recommended_actions.insert(0, f"Prepare for {upcoming.title}.")
        outside = ["Re-read the relevant textbook or lecture section.", "Try one practice problem without hints."] if user.include_outside_study_suggestions else []
        links = self._links(clean_subject)
        email_subject = f"Sapient Review Plan: {upcoming.title if upcoming else subject_label}"

        digest = ReviewDigest(
            subject=clean_subject,
            reason=reason,
            email_subject=email_subject,
            focus_topics=focus_topics or [subject_label],
            key_notes=key_notes,
            weak_areas=weak_topics[:5],
            recommended_actions=recommended_actions,
            outside_study_actions=outside,
            links=links,
            upcoming_deadline=_assignment_payload(upcoming) if upcoming else None,
        )
        digest.text_body = render_review_digest_text(digest)
        digest.html_body = render_review_digest_html(digest)
        return digest

    async def _assignments(self, *, session: AsyncSession, user_id: int, subject: str | None, now: datetime) -> list[Assignment]:
        stmt = select(Assignment).where(Assignment.user_id == user_id, Assignment.completed.is_(False), Assignment.due_at >= now, Assignment.due_at <= now + timedelta(days=14))
        if subject:
            stmt = stmt.where(func.lower(Assignment.subject) == subject.lower())
        stmt = stmt.order_by(Assignment.due_at.asc(), Assignment.id.asc()).limit(5)
        return list((await session.execute(stmt)).scalars())

    async def _notes(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[KeyIdea]:
        stmt = select(KeyIdea).where(KeyIdea.user_id == user_id).order_by(KeyIdea.created_at.desc()).limit(12)
        if subject:
            stmt = stmt.where(func.lower(KeyIdea.subject) == subject.lower())
        return list((await session.execute(stmt)).scalars())

    async def _profile(self, *, session: AsyncSession, user_id: int, subject: str | None) -> ProjectProfile | None:
        if not subject:
            return None
        return await session.scalar(select(ProjectProfile).where(ProjectProfile.user_id == user_id, func.lower(ProjectProfile.subject) == subject.lower()))

    async def _weak_topics(self, *, session: AsyncSession, user_id: int, subject: str | None, profile: ProjectProfile | None) -> list[str]:
        weak: list[str] = []
        if profile and isinstance(profile.knowledge_state, dict):
            for value in profile.knowledge_state.values():
                if isinstance(value, dict) and float(value.get("mastery", 1.0)) < 0.6:
                    concept = str(value.get("concept") or "").strip()
                    if concept:
                        weak.append(concept)
        stmt = select(Conversation).where(Conversation.user_id == user_id, Conversation.summary.is_not(None)).order_by(Conversation.created_at.desc()).limit(8)
        if subject:
            stmt = stmt.where(func.lower(Conversation.subject) == subject.lower())
        for conv in (await session.execute(stmt)).scalars():
            if isinstance(conv.summary, dict):
                weak.extend(str(item) for item in conv.summary.get("struggled_with", []) if item)
        return _unique(weak)[:8]

    async def _recent_quiz_misses(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[str]:
        stmt = (
            select(Quiz.concept)
            .join(QuizAttempt, QuizAttempt.quiz_id == Quiz.id)
            .join(Conversation, Conversation.id == Quiz.conversation_id)
            .where(Conversation.user_id == user_id, QuizAttempt.user_id == user_id, QuizAttempt.is_correct.is_(False))
            .order_by(QuizAttempt.attempted_at.desc())
            .limit(8)
        )
        if subject:
            stmt = stmt.where(func.lower(Conversation.subject) == subject.lower())
        return _unique([str(item) for item in (await session.execute(stmt)).scalars() if item])[:5]

    async def _recent_lectures(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[LectureNote]:
        stmt = select(LectureNote).where(LectureNote.user_id == user_id).order_by(LectureNote.created_at.desc()).limit(3)
        if subject:
            stmt = stmt.where(func.lower(LectureNote.subject) == subject.lower())
        return list((await session.execute(stmt)).scalars())

    def _learning_map_topics(self, profile: ProjectProfile | None) -> list[str]:
        nodes = profile.mind_map.get("nodes", []) if profile and isinstance(profile.mind_map, dict) else []
        return [str(node.get("topic")) for node in nodes if isinstance(node, dict) and node.get("topic")]

    def _links(self, subject: str | None) -> list[dict[str, str]]:
        base = self.settings.app_base_url.rstrip("/")
        if not subject:
            return [{"label": "Open Sapient", "url": base}]
        from urllib.parse import quote

        encoded = quote(subject)
        return [
            {"label": "Open subject", "url": f"{base}/projects/{encoded}"},
            {"label": "Review flashcards", "url": f"{base}/projects/{encoded}?tab=flashcards"},
            {"label": "Start practice quiz", "url": f"{base}/projects/{encoded}?tab=quizzes"},
            {"label": "Open Lecture Mode", "url": f"{base}/projects/{encoded}"},
            {"label": "View notes", "url": f"{base}/projects/{encoded}?tab=notes"},
        ]

    def _reason(self, *, trigger_type: str, upcoming: Assignment | None, due_count: int, weak_topics: list[str]) -> str:
        if upcoming:
            return f"You have {upcoming.title} coming up on {upcoming.due_at.strftime('%b %d').replace(' 0', ' ')}."
        if due_count:
            return f"You have {due_count} due flashcard{'' if due_count == 1 else 's'} ready for review."
        if weak_topics:
            return "Your recent work shows a few topics that need review."
        return "Here is a focused review plan for your next study session."


def render_review_digest_text(digest: ReviewDigest) -> str:
    lines = [digest.reason, "", "Focus on:", *[f"- {item}" for item in digest.focus_topics]]
    if digest.key_notes:
        lines.extend(["", "Key notes:", *[f"- {item}" for item in digest.key_notes]])
    if digest.weak_areas:
        lines.extend(["", "Weak areas:", *[f"- {item}" for item in digest.weak_areas]])
    lines.extend(["", "Recommended study plan:", *[f"{i}. {item}" for i, item in enumerate(digest.recommended_actions + digest.outside_study_actions, start=1)]])
    lines.extend(["", "Links:", *[f"- {link['label']}: {link['url']}" for link in digest.links], "", "You can adjust review reminders in Sapient settings."])
    return "\n".join(lines)


def render_review_digest_html(digest: ReviewDigest) -> str:
    def ul(items: list[str]) -> str:
        return "<ul>" + "".join(f"<li>{html.escape(item)}</li>" for item in items) + "</ul>"

    body = [
        "<h1>Sapient Review Plan</h1>",
        f"<p>{html.escape(digest.reason)}</p>",
        "<h2>Focus on</h2>",
        ul(digest.focus_topics),
    ]
    if digest.key_notes:
        body.extend(["<h2>Key notes</h2>", ul(digest.key_notes)])
    if digest.weak_areas:
        body.extend(["<h2>Weak areas</h2>", ul(digest.weak_areas)])
    actions = digest.recommended_actions + digest.outside_study_actions
    body.extend(["<h2>Recommended study plan</h2>", "<ol>" + "".join(f"<li>{html.escape(item)}</li>" for item in actions) + "</ol>"])
    body.extend(["<h2>Links</h2>", "<ul>" + "".join(f"<li><a href=\"{html.escape(link['url'])}\">{html.escape(link['label'])}</a></li>" for link in digest.links) + "</ul>"])
    body.append("<p style=\"color:#64748b;font-size:13px\">You can adjust review reminders in Sapient settings.</p>")
    return "\n".join(body)


def _short(value: str, limit: int) -> str:
    clean = " ".join(value.split())
    return clean if len(clean) <= limit else f"{clean[: limit - 3].rstrip()}..."


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        clean = value.strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            out.append(clean)
    return out


def _assignment_payload(assignment: Assignment | None) -> dict[str, str] | None:
    if assignment is None:
        return None
    return {"title": assignment.title, "due_at": assignment.due_at.isoformat(), "subject": assignment.subject or ""}


def _as_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
