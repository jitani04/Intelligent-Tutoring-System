from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import Settings
from app.models.assignment import Assignment
from app.models.conversation import Conversation
from app.models.key_idea import KeyIdea
from app.models.lecture_note import LectureNote
from app.models.project_profile import ProjectProfile
from app.models.user import User
from app.services.agent_tools import TOOL_REGISTRY, allowed_chat_tool_names
from app.services.email_service import NoopEmailProvider, ResendEmailProvider, create_email_provider
from app.services.onboarding_email_service import build_onboarding_email, send_onboarding_email
from app.services.review_digest_service import ReviewDigestService
from app.services.study_planner import StudyPlanner


class _ScalarsResult:
    def __init__(self, items):
        self.items = items

    def __iter__(self):
        return iter(self.items)


class _ExecuteResult:
    def __init__(self, items):
        self.items = items

    def scalars(self):
        return _ScalarsResult(self.items)


class _FakeSession:
    def __init__(self, *, execute_results, scalar_result=None):
        self.execute_results = list(execute_results)
        self.scalar_result = scalar_result

    async def execute(self, _statement):
        return _ExecuteResult(self.execute_results.pop(0))

    async def scalar(self, _statement):
        return self.scalar_result


def _settings(**overrides) -> Settings:
    values = {
        "DATABASE_URL": "sqlite+aiosqlite:///:memory:",
        "LLM_API_KEY": "test",
        "JWT_SECRET": "test",
    }
    for key, value in overrides.items():
        alias = Settings.model_fields[key].alias if key in Settings.model_fields else key
        values[alias or key] = value
    return Settings(**values)


def test_study_planner_requires_approval_for_review_digest_email() -> None:
    plan = StudyPlanner().plan(
        user_message="Can you email me a review plan?",
        current_mode="chat",
        weak_topics=["Flexbox", "Box Model"],
        due_flashcards_count=2,
        has_retrieved_sources=False,
        upcoming_assignments=[{"title": "Web Design Quiz"}],
    )

    assert plan.recommended_action == "generate_review_digest"
    assert plan.approval_required is True
    assert plan.tools_to_consider == ["generate_review_digest", "send_review_digest_email"]


def test_study_planner_selects_practice_for_quiz_requests() -> None:
    plan = StudyPlanner().plan(
        user_message="quiz me on this",
        current_mode="chat",
        weak_topics=["CSS Box Model"],
        due_flashcards_count=0,
        has_retrieved_sources=False,
        upcoming_assignments=[],
    )

    assert plan.current_mode == "practice"
    assert plan.recommended_action == "generate_quiz"
    assert plan.target_topics == ["CSS Box Model"]


def test_agent_tool_registry_marks_sensitive_tools_for_approval() -> None:
    assert "generate_quiz" in allowed_chat_tool_names()
    assert "create_structured_diagram" in allowed_chat_tool_names()
    assert "create_structured_diagram" in TOOL_REGISTRY
    assert TOOL_REGISTRY["send_review_digest_email"].approval_policy == "opt_in_required"
    assert TOOL_REGISTRY["update_learning_map"].approval_policy == "user_approval_required"
    assert TOOL_REGISTRY["schedule_review"].approval_policy == "user_approval_required"


@pytest.mark.asyncio
async def test_review_digest_generation_uses_deadlines_notes_weak_topics_and_quiz_misses() -> None:
    now = datetime.now(timezone.utc)
    user = User(
        id=7,
        email="student@example.com",
        include_key_notes=True,
        include_outside_study_suggestions=True,
    )
    assignment = Assignment(
        id=1,
        user_id=7,
        subject="Web Design",
        title="Web Design Quiz",
        due_at=now + timedelta(days=3),
        completed=False,
    )
    due_note = KeyIdea(
        id=2,
        user_id=7,
        conversation_id=11,
        subject="Web Design",
        concept="Margin vs padding",
        summary="Margin is outside the border and padding is inside the border.",
        sr_due_date=now - timedelta(hours=1),
        created_at=now,
    )
    profile = ProjectProfile(
        user_id=7,
        subject="Web Design",
        knowledge_state={"css": {"concept": "CSS Box Model", "mastery": 0.42}},
        mind_map={"nodes": [{"topic": "Flexbox basics"}]},
    )
    weak_conversation = Conversation(
        id=9,
        user_id=7,
        subject="Web Design",
        summary={"struggled_with": ["Flexbox layout basics"]},
    )
    lecture = LectureNote(
        id=5,
        user_id=7,
        subject="Web Design",
        title="Layout recap",
        timeline=[],
        created_at=now,
    )
    session = _FakeSession(
        execute_results=[
            [assignment],
            [due_note],
            [weak_conversation],
            ["Margin vs padding"],
            [lecture],
        ],
        scalar_result=profile,
    )

    digest = await ReviewDigestService(settings=_settings(app_base_url="https://sapient.test")).generate_digest(
        session=session,
        user=user,
        subject="Web Design",
        trigger_type="manual",
    )

    assert digest.email_subject == "Sapient Review Plan: Web Design Quiz"
    assert "Web Design Quiz" in digest.reason
    assert "CSS Box Model" in digest.focus_topics
    assert "Margin vs padding" in digest.focus_topics
    assert digest.key_notes == ["Margin vs padding: Margin is outside the border and padding is inside the border."]
    assert "Use Lecture Mode for a quick recap." in digest.recommended_actions
    assert any(link["url"] == "https://sapient.test/projects/Web%20Design?tab=quizzes" for link in digest.links)
    assert "Recommended study plan" in digest.text_body
    assert "Sapient Review Plan</h1>" in digest.html_body
    assert "color:#e2eaf4" in digest.html_body


@pytest.mark.asyncio
async def test_noop_email_provider_returns_success_without_network() -> None:
    result = await NoopEmailProvider().send_email(
        to="student@example.com",
        subject="Sapient Review Plan",
        html_body="<p>Review</p>",
        text_body="Review",
        idempotency_key="abc123",
    )

    assert result.provider == "noop"
    assert result.status == "sent"
    assert result.message_id == "noop-abc123"


def test_create_email_provider_uses_noop_by_default() -> None:
    provider = create_email_provider(_settings(email_provider="noop"))

    assert isinstance(provider, NoopEmailProvider)


@pytest.mark.asyncio
async def test_resend_provider_request_shape(monkeypatch: pytest.MonkeyPatch) -> None:
    captured = {}

    class _Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"id": "email_123"}

    class _Client:
        def __init__(self, timeout):
            captured["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _Response()

    monkeypatch.setattr("app.services.email_service.httpx.AsyncClient", _Client)

    result = await ResendEmailProvider(settings=_settings(email_provider="resend", email_from_address="Sapient <review@sapient.test>", resend_api_key="rk_test")).send_email(
        to="student@example.com",
        subject="Plan",
        html_body="<p>Plan</p>",
        text_body="Plan",
        idempotency_key="digest-1",
    )

    assert result.provider == "resend"
    assert result.message_id == "email_123"
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer rk_test"
    assert captured["headers"]["Idempotency-Key"] == "digest-1"
    assert captured["json"]["to"] == ["student@example.com"]
    assert captured["json"]["from"] == "Sapient <review@sapient.test>"


def test_onboarding_email_template_links_to_app() -> None:
    message = build_onboarding_email(
        user_id=42,
        email="student@example.com",
        name="Jenna",
        settings=_settings(app_base_url="https://sapient.test"),
    )

    assert message.to == "student@example.com"
    assert message.subject == "Welcome to Sapient, Jenna!"
    assert message.idempotency_key == "onboarding-user-42"
    assert "Hi Jenna" in message.text_body
    assert "https://sapient.test" in message.text_body
    assert 'href="https://sapient.test"' in message.html_body
    assert "color:#e2eaf4" in message.html_body


@pytest.mark.asyncio
async def test_send_onboarding_email_uses_provider() -> None:
    captured = {}

    class _Provider:
        async def send_email(self, *, to, subject, html_body, text_body, idempotency_key):
            captured.update(
                {
                    "to": to,
                    "subject": subject,
                    "html_body": html_body,
                    "text_body": text_body,
                    "idempotency_key": idempotency_key,
                }
            )
            return type("Result", (), {"provider": "test", "message_id": "msg_123"})()

    await send_onboarding_email(
        user_id=9,
        email="student@example.com",
        name=None,
        provider=_Provider(),
        settings=_settings(app_base_url="https://sapient.test"),
    )

    assert captured["to"] == "student@example.com"
    assert captured["subject"] == "Welcome to Sapient, there!"
    assert captured["idempotency_key"] == "onboarding-user-9"


@pytest.mark.asyncio
async def test_send_onboarding_email_swallows_provider_failure() -> None:
    class _Provider:
        async def send_email(self, **_kwargs):
            raise RuntimeError("provider down")

    await send_onboarding_email(
        user_id=9,
        email="student@example.com",
        provider=_Provider(),
        settings=_settings(app_base_url="https://sapient.test"),
    )
