"""Socratic-style LLM grading for quiz attempts.

The default grader at `/quizzes/{id}/attempt` does a case-insensitive string
match against `quiz.correct_answer` and returns the static `quiz.explanation`.
That's fast but gives the same feedback regardless of what the user wrote, so
partial-credit answers and free-text responses with the right idea but wrong
phrasing read as flat "Not quite".

This service asks the LLM to read the user's actual answer alongside the
canonical answer and produce targeted Socratic feedback that quotes what they
said and points to the specific gap. It's only called on the wrong / non-MCQ
path (the route falls back to the cheap string check for clear MCQ hits) so
each LLM call lands on a real teaching moment, not a routine correct answer.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class GradedAttempt:
    is_correct: bool
    explanation: str


_SYSTEM_PROMPT = (
    "You are a Socratic tutor grading a single student answer. "
    "Read the question, the canonical correct answer, and the student's response. "
    "Decide whether the student demonstrated the underlying understanding. "
    "Be generous: paraphrases, different wording, and answers that capture the core idea "
    "should be marked correct. Mark partial when the student got part of the idea but "
    "made a specific mistake. Mark incorrect when the central claim is wrong or missing.\n\n"
    "Write feedback in 2–3 sentences that (a) quotes or paraphrases what the student "
    "actually wrote, (b) names the specific thing they got right or wrong, and "
    "(c) restates the key idea. Address the student directly as 'you'. "
    "Do not be condescending. Do not just repeat the canonical answer.\n\n"
    "Respond with ONLY valid JSON of the form:\n"
    '{"verdict": "correct" | "partial" | "incorrect", "feedback": "..."}'
)


def _build_user_prompt(
    *,
    question: str,
    correct_answer: str,
    user_answer: str,
    quiz_type: str,
    options: list[str] | None,
) -> str:
    parts = [
        f"QUESTION:\n{question}",
        f"CANONICAL ANSWER:\n{correct_answer}",
    ]
    if quiz_type == "multiple_choice" and options:
        parts.append("OPTIONS:\n" + "\n".join(f"- {opt}" for opt in options))
    parts.append(f"STUDENT'S ANSWER:\n{user_answer}")
    return "\n\n".join(parts)


def _strip_code_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        # Drop leading fence (``` or ```json) and trailing fence.
        body = raw.split("```", 2)
        if len(body) >= 2:
            inner = body[1]
            if inner.lstrip().startswith("json"):
                inner = inner.lstrip()[4:]
            raw = inner.rsplit("```", 1)[0]
    return raw.strip()


async def grade_quiz_attempt(
    *,
    llm_service: LLMService,
    question: str,
    correct_answer: str,
    user_answer: str,
    base_explanation: str,
    quiz_type: str,
    options: list[str] | None = None,
) -> GradedAttempt:
    """Grade a single quiz attempt using the LLM.

    Returns a GradedAttempt. On any LLM / parse failure, falls back to the
    naive string-equality verdict plus the canonical explanation so the user
    still gets a usable response.
    """
    naive_correct = user_answer.strip().lower() == correct_answer.strip().lower()

    user_prompt = _build_user_prompt(
        question=question,
        correct_answer=correct_answer,
        user_answer=user_answer,
        quiz_type=quiz_type,
        options=options,
    )

    lc_messages = llm_service.to_langchain_messages(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )

    try:
        # We need a single complete response; the streaming API is overkill here.
        # Use the underlying langchain runnable directly (same pattern as artifacts.py).
        response = await llm_service._llm.ainvoke(lc_messages)  # noqa: SLF001
    except Exception as exc:  # noqa: BLE001
        logger.warning("Quiz grading LLM call failed: %s", exc)
        return GradedAttempt(is_correct=naive_correct, explanation=base_explanation)

    raw = response.content if isinstance(response.content, str) else ""
    raw = _strip_code_fences(raw)

    try:
        data: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Quiz grading JSON parse failed: %s", raw[:300])
        return GradedAttempt(is_correct=naive_correct, explanation=base_explanation)

    verdict = str(data.get("verdict", "")).strip().lower()
    feedback = str(data.get("feedback", "")).strip()
    if not feedback:
        return GradedAttempt(is_correct=naive_correct, explanation=base_explanation)

    is_correct = verdict == "correct"
    return GradedAttempt(is_correct=is_correct, explanation=feedback)
