from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

StudyMode = Literal["chat", "lecture", "practice", "review"]
RecommendedAction = Literal[
    "answer",
    "retrieve_then_answer",
    "generate_quiz",
    "save_key_idea",
    "create_flashcards",
    "practice_weak_topic",
    "review_due_flashcards",
    "generate_study_plan",
    "create_structured_diagram",
    "create_diagram",
    "find_resource",
    "recommend_next_topic",
    "generate_review_digest",
    "send_review_digest_email",
]


@dataclass(slots=True)
class StudyPlan:
    user_intent: str
    current_mode: StudyMode
    recommended_action: RecommendedAction
    target_topics: list[str] = field(default_factory=list)
    reason: str = ""
    tools_to_consider: list[str] = field(default_factory=list)
    approval_required: bool = False


class StudyPlanner:
    def plan(self, *, user_message: str, current_mode: StudyMode, weak_topics: list[str], due_flashcards_count: int, has_retrieved_sources: bool, upcoming_assignments: list[dict]) -> StudyPlan:
        text = user_message.lower()

        if any(term in text for term in ["email", "send me", "review plan", "digest"]):
            return StudyPlan(
                user_intent="review_digest_email",
                current_mode="review",
                recommended_action="generate_review_digest",
                target_topics=weak_topics[:3],
                reason="The student asked for a review plan or email digest.",
                tools_to_consider=["generate_review_digest", "send_review_digest_email"],
                approval_required=True,
            )

        if any(term in text for term in ["quiz me", "practice", "test me"]):
            target_topics = weak_topics[:2] or _topics_from_assignments(upcoming_assignments)[:2]
            return StudyPlan(
                user_intent="practice",
                current_mode="practice",
                recommended_action="generate_quiz",
                target_topics=target_topics,
                reason="The student asked for practice.",
                tools_to_consider=["generate_quiz", "grade_answer", "update_mastery"],
            )

        if any(term in text for term in ["flashcard", "due cards", "review cards"]):
            return StudyPlan(
                user_intent="flashcard_review",
                current_mode="review",
                recommended_action="review_due_flashcards" if due_flashcards_count else "create_flashcards",
                target_topics=weak_topics[:3],
                reason="The student is asking about flashcards or review.",
                tools_to_consider=["create_flashcards", "recommend_next_topic"],
                approval_required=due_flashcards_count == 0,
            )

        if any(term in text for term in ["diagram", "flowchart", "mind map", "visualize"]):
            return StudyPlan(
                user_intent="visual_explanation",
                current_mode=current_mode,
                recommended_action="create_structured_diagram",
                reason="A visual representation is likely useful.",
                tools_to_consider=["create_structured_diagram", "create_diagram"],
            )

        if any(term in text for term in ["resource", "video", "article", "link", "tutorial"]):
            return StudyPlan(
                user_intent="resource_request",
                current_mode=current_mode,
                recommended_action="find_resource",
                reason="The student asked for outside resources.",
                tools_to_consider=["find_resource"],
            )

        if has_retrieved_sources:
            return StudyPlan(
                user_intent="grounded_answer",
                current_mode=current_mode,
                recommended_action="retrieve_then_answer",
                reason="Relevant uploaded materials were found.",
                tools_to_consider=["retrieve_materials", "save_key_idea"],
            )

        if weak_topics and any(term in text for term in ["what next", "next", "study", "review"]):
            return StudyPlan(
                user_intent="next_step",
                current_mode="review",
                recommended_action="practice_weak_topic",
                target_topics=weak_topics[:2],
                reason="Weak topics are available and the student asked what to do next.",
                tools_to_consider=["recommend_next_topic", "generate_quiz"],
            )

        return StudyPlan(
            user_intent="answer_question",
            current_mode=current_mode,
            recommended_action="answer",
            target_topics=weak_topics[:1],
            reason="Default bounded tutoring response.",
            tools_to_consider=["save_key_idea", "generate_quiz", "find_resource"],
        )


def _topics_from_assignments(assignments: list[dict]) -> list[str]:
    topics: list[str] = []
    for assignment in assignments:
        title = str(assignment.get("title") or "").strip()
        if title:
            topics.append(title[:80])
    return topics
