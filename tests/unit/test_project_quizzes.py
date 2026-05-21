from datetime import datetime, timezone
import sys
import types

import pytest

sys.modules.setdefault(
    "langchain_anthropic",
    types.SimpleNamespace(ChatAnthropic=object),
)
sys.modules.setdefault(
    "langchain_google_genai",
    types.SimpleNamespace(ChatGoogleGenerativeAI=object),
)
sys.modules.setdefault(
    "langchain_openai",
    types.SimpleNamespace(ChatOpenAI=object),
)

from app.api.routes.projects import _project_quizzes_query, list_project_quizzes
from app.models.quiz import Quiz


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
    def __init__(self, items):
        self.items = items
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _ExecuteResult(self.items)


def test_project_quizzes_query_filters_to_owned_subject_quizzes() -> None:
    statement = _project_quizzes_query(user_id=7, subject="Web Design")
    compiled = statement.compile()
    sql = str(compiled).lower()

    assert "join conversations" in sql
    assert "conversations.user_id" in sql
    assert "conversations.subject" in sql
    assert "quizzes.created_at desc" in sql
    assert "quizzes.id desc" in sql
    assert 7 in compiled.params.values()
    assert "Web Design" in compiled.params.values()


@pytest.mark.asyncio
async def test_list_project_quizzes_returns_quiz_reads_newest_first_query() -> None:
    created_at = datetime(2026, 5, 20, 12, 0, tzinfo=timezone.utc)
    session = _FakeSession([
        Quiz(
            id=11,
            conversation_id=101,
            message_id=None,
            question="What does padding affect?",
            concept="CSS Box Model",
            quiz_type="short_answer",
            options=None,
            correct_answer="Inside spacing",
            explanation="Padding is the space inside the border.",
            created_at=created_at,
        ),
        Quiz(
            id=10,
            conversation_id=100,
            message_id=55,
            question="Which property controls outside spacing?",
            concept="CSS Box Model",
            quiz_type="multiple_choice",
            options=["margin", "padding"],
            correct_answer="margin",
            explanation="Margin is outside the border.",
            created_at=created_at,
        ),
    ])

    quizzes = await list_project_quizzes(subject="Web Design", user_id=7, session=session)

    assert [quiz.id for quiz in quizzes] == [11, 10]
    assert quizzes[0].concept == "CSS Box Model"
    assert quizzes[1].message_id == 55
    assert session.statement is not None
