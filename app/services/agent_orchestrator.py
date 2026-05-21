from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.observability import record_pending_agent_action_created
from app.models.agent_action import PendingAgentAction
from app.models.assignment import Assignment
from app.models.conversation import Conversation
from app.models.key_idea import KeyIdea
from app.models.project_profile import ProjectProfile
from app.models.quiz import Quiz, QuizAttempt
from app.models.user import User
from app.services.agent_tools import allowed_chat_tool_names, tool_summaries
from app.services.chat_service import SseEvent, stream_chat
from app.services.email_service import EmailProvider
from app.services.llm_service import LLMService
from app.services.review_digest_service import ReviewDigestService
from app.services.resource_service import YouTubeResourceProvider
from app.services.study_planner import StudyPlanner, StudyPlan
from app.services.web_image_service import WebImageService
from app.services.web_search_service import LangSearchWebSearch

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class AgentState:
    user_id: int
    subject_id: str | None
    conversation_id: int
    current_goal: str | None
    current_mode: str
    mastery_by_topic: dict[str, float] = field(default_factory=dict)
    weak_topics: list[str] = field(default_factory=list)
    due_flashcards: list[dict[str, Any]] = field(default_factory=list)
    upcoming_assignments: list[dict[str, Any]] = field(default_factory=list)
    recent_notes: list[dict[str, Any]] = field(default_factory=list)
    retrieved_sources: list[dict[str, Any]] = field(default_factory=list)
    allowed_tools: list[str] = field(default_factory=list)
    email_preferences: dict[str, Any] = field(default_factory=dict)
    feedback_preferences_enabled: bool = False

    def prompt_context(self) -> dict[str, Any]:
        return {
            "mode": self.current_mode,
            "goal": self.current_goal,
            "weak_topics": self.weak_topics[:6],
            "due_flashcard_count": len(self.due_flashcards),
            "upcoming_assignments": self.upcoming_assignments[:3],
            "recent_notes": self.recent_notes[:5],
            "mastery_by_topic": self.mastery_by_topic,
            "allowed_tools": tool_summaries(self.allowed_tools),
            "email_preferences": self.email_preferences,
        }


@dataclass(slots=True)
class NextBestAction:
    title: str
    reason: str
    actions: list[dict[str, str]]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class AgentOrchestrator:
    def __init__(
        self,
        *,
        planner: StudyPlanner | None = None,
        digest_service: ReviewDigestService | None = None,
        email_provider: EmailProvider | None = None,
    ) -> None:
        self.planner = planner or StudyPlanner()
        self.digest_service = digest_service or ReviewDigestService()
        self.email_provider = email_provider

    async def stream_turn(
        self,
        *,
        session: AsyncSession,
        llm_service: LLMService,
        conversation: Conversation,
        user: User,
        user_message: str,
        system_prompt: str,
        user_message_id: int | None = None,
        image_service: WebImageService | None = None,
        web_search_service: LangSearchWebSearch | None = None,
        resource_provider: YouTubeResourceProvider | None = None,
        preference_summary: str | None = None,
        preference_memories: list[str] | None = None,
        allowed_tool_names: list[str] | None = None,
    ) -> AsyncIterator[SseEvent]:
        yield SseEvent(event="agent_step", data={"message": "Checking your learning state..."})
        state = await self.build_state(session=session, user=user, conversation=conversation)
        if allowed_tool_names is not None:
            requested_tools = set(allowed_tool_names)
            state.allowed_tools = [tool for tool in state.allowed_tools if tool in requested_tools]
        yield SseEvent(event="agent_step", data={"message": "Checking weak topics and due review..."})
        plan = self.planner.plan(
            user_message=user_message,
            current_mode="lecture" if conversation.is_lecture else "chat",
            weak_topics=state.weak_topics,
            due_flashcards_count=len(state.due_flashcards),
            has_retrieved_sources=False,
            upcoming_assignments=state.upcoming_assignments,
        )
        logger.info(
            "agent plan selected",
            extra={
                "conversation_id": conversation.id,
                "user_id": user.id,
                "subject": conversation.subject,
                "recommended_action": plan.recommended_action,
                "target_topics": plan.target_topics,
                "approval_required": plan.approval_required,
            },
        )
        yield SseEvent(event="agent_step", data={"message": self._step_for_plan(plan), "plan": asdict(plan)})

        if plan.recommended_action == "generate_review_digest":
            yield SseEvent(event="agent_step", data={"message": "Building your review plan..."})
            pending_action = await self._create_review_digest_pending_action(
                session=session,
                user=user,
                conversation=conversation,
                trigger_type="manual",
            )
            yield SseEvent(event="pending_action", data=self._pending_action_payload(pending_action))

        async for event in stream_chat(
            session=session,
            llm_service=llm_service,
            conversation_id=conversation.id,
            user_id=user.id,
            user_message=user_message,
            system_prompt=system_prompt,
            user_message_id=user_message_id,
            image_service=image_service,
            web_search_service=web_search_service,
            resource_provider=resource_provider,
            preference_summary=preference_summary,
            preference_memories=preference_memories,
            agent_state=state.prompt_context(),
            study_plan=asdict(plan),
            allowed_tool_names=state.allowed_tools,
        ):
            yield event
            if event.event == "end":
                next_action = await self._next_best_action(session=session, conversation=conversation, state=state, plan=plan)
                yield SseEvent(event="next_best_action", data=next_action.to_dict())

    async def build_state(self, *, session: AsyncSession, user: User, conversation: Conversation) -> AgentState:
        subject = conversation.subject
        profile = await self._profile(session=session, user_id=user.id, subject=subject)
        due_flashcards = await self._due_flashcards(session=session, user_id=user.id, subject=subject)
        notes = await self._recent_notes(session=session, user_id=user.id, subject=subject)
        assignments = await self._upcoming_assignments(session=session, user_id=user.id, subject=subject)
        mastery_by_topic, weak_topics = self._mastery(profile)
        weak_topics = await self._summary_weak_topics(session=session, user_id=user.id, subject=subject, existing=weak_topics)
        allowed_tools = allowed_chat_tool_names()
        if user.enable_review_emails or any(assignments):
            allowed_tools.append("generate_review_digest")
        return AgentState(
            user_id=user.id,
            subject_id=subject,
            conversation_id=conversation.id,
            current_goal=profile.goals if profile else None,
            current_mode="lecture" if conversation.is_lecture else "chat",
            mastery_by_topic=mastery_by_topic,
            weak_topics=weak_topics,
            due_flashcards=due_flashcards,
            upcoming_assignments=assignments,
            recent_notes=notes,
            allowed_tools=allowed_tools,
            email_preferences={
                "enabled": user.enable_review_emails,
                "frequency": user.reminder_frequency,
                "email_address": user.review_email_address or user.email,
                "digest_style": user.digest_style,
                "include_key_notes": user.include_key_notes,
                "include_outside_study_suggestions": user.include_outside_study_suggestions,
            },
            feedback_preferences_enabled=bool(user.preference_summary),
        )

    async def _profile(self, *, session: AsyncSession, user_id: int, subject: str | None) -> ProjectProfile | None:
        if not subject:
            return None
        return await session.scalar(select(ProjectProfile).where(ProjectProfile.user_id == user_id, func.lower(ProjectProfile.subject) == subject.lower()))

    async def _due_flashcards(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        stmt = select(KeyIdea).where(KeyIdea.user_id == user_id, KeyIdea.sr_due_date <= now).order_by(KeyIdea.sr_due_date.asc()).limit(10)
        if subject:
            stmt = stmt.where(func.lower(KeyIdea.subject) == subject.lower())
        return [{"id": card.id, "concept": card.concept, "due_at": card.sr_due_date.isoformat()} for card in (await session.execute(stmt)).scalars()]

    async def _recent_notes(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[dict[str, Any]]:
        stmt = select(KeyIdea).where(KeyIdea.user_id == user_id).order_by(KeyIdea.created_at.desc()).limit(8)
        if subject:
            stmt = stmt.where(func.lower(KeyIdea.subject) == subject.lower())
        return [{"id": note.id, "concept": note.concept, "summary": note.summary[:240]} for note in (await session.execute(stmt)).scalars()]

    async def _upcoming_assignments(self, *, session: AsyncSession, user_id: int, subject: str | None) -> list[dict[str, Any]]:
        now = datetime.now(timezone.utc)
        stmt = select(Assignment).where(Assignment.user_id == user_id, Assignment.completed.is_(False), Assignment.due_at >= now).order_by(Assignment.due_at.asc()).limit(5)
        if subject:
            stmt = stmt.where(func.lower(Assignment.subject) == subject.lower())
        return [{"id": item.id, "title": item.title, "due_at": item.due_at.isoformat(), "subject": item.subject} for item in (await session.execute(stmt)).scalars()]

    async def _summary_weak_topics(self, *, session: AsyncSession, user_id: int, subject: str | None, existing: list[str]) -> list[str]:
        weak = list(existing)
        stmt = select(Conversation).where(Conversation.user_id == user_id, Conversation.summary.is_not(None)).order_by(Conversation.created_at.desc()).limit(6)
        if subject:
            stmt = stmt.where(func.lower(Conversation.subject) == subject.lower())
        for conv in (await session.execute(stmt)).scalars():
            if isinstance(conv.summary, dict):
                weak.extend(str(item) for item in conv.summary.get("struggled_with", []) if item)
        return _unique(weak)[:8]

    def _mastery(self, profile: ProjectProfile | None) -> tuple[dict[str, float], list[str]]:
        mastery: dict[str, float] = {}
        weak: list[str] = []
        if profile and isinstance(profile.knowledge_state, dict):
            for value in profile.knowledge_state.values():
                if not isinstance(value, dict):
                    continue
                concept = str(value.get("concept") or "").strip()
                score = float(value.get("mastery", 0.0))
                if concept:
                    mastery[concept] = score
                    if score < 0.6:
                        weak.append(concept)
        return mastery, weak

    def _step_for_plan(self, plan: StudyPlan) -> str:
        return {
            "retrieve_then_answer": "Searching your uploaded materials...",
            "generate_quiz": "Preparing a practice question...",
            "create_diagram": "Planning a visual explanation...",
            "find_resource": "Looking for a helpful resource...",
            "generate_review_digest": "Preparing review digest email...",
            "review_due_flashcards": "Reviewing due flashcards...",
            "practice_weak_topic": "Checking weak topics...",
        }.get(plan.recommended_action, "Choosing the next tutoring move...")

    async def _create_review_digest_pending_action(self, *, session: AsyncSession, user: User, conversation: Conversation, trigger_type: str) -> PendingAgentAction:
        digest = await self.digest_service.generate_digest(session=session, user=user, subject=conversation.subject, trigger_type=trigger_type)
        action = PendingAgentAction(
            user_id=user.id,
            conversation_id=conversation.id,
            subject=conversation.subject,
            action_type="send_review_digest_email",
            payload={"subject": conversation.subject, "trigger_type": trigger_type, "to": user.review_email_address or user.email},
            explanation=digest.reason,
            preview=digest.to_dict(),
            status="pending",
        )
        session.add(action)
        await session.commit()
        await session.refresh(action)
        logger.info("pending agent action created", extra={"action_id": action.id, "action_type": action.action_type, "user_id": user.id})
        record_pending_agent_action_created(action.action_type)
        return action

    def _pending_action_payload(self, action: PendingAgentAction) -> dict[str, Any]:
        return {
            "id": action.id,
            "action_type": action.action_type,
            "explanation": action.explanation,
            "status": action.status,
            "payload": action.payload,
            "preview": action.preview,
        }

    async def _next_best_action(self, *, session: AsyncSession, conversation: Conversation, state: AgentState, plan: StudyPlan) -> NextBestAction:
        topic = state.weak_topics[0] if state.weak_topics else (plan.target_topics[0] if plan.target_topics else conversation.subject or "your next topic")
        action = NextBestAction(
            title=f"Practice {topic}",
            reason="This is the best next step based on weak topics, due review, and upcoming deadlines.",
            actions=[
                {"label": "Start practice", "kind": "practice"},
                {"label": "Review notes", "kind": "notes"},
                {"label": "Use Lecture Mode", "kind": "lecture"},
                {"label": "Review flashcards", "kind": "flashcards"},
                {"label": "Email me a review plan", "kind": "review_digest"},
            ],
        )
        if conversation.subject:
            profile = await self._profile(session=session, user_id=conversation.user_id, subject=conversation.subject)
            if profile:
                profile.next_recommended_action = action.to_dict()
                await session.commit()
        logger.info("next best action selected", extra={"conversation_id": conversation.id, "title": action.title})
        return action


def _unique(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = value.strip()
        key = clean.lower()
        if clean and key not in seen:
            seen.add(key)
            out.append(clean)
    return out
