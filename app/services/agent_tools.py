from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

ApprovalPolicy = Literal["none", "user_approval_required", "opt_in_required"]


@dataclass(frozen=True, slots=True)
class AgentToolDefinition:
    name: str
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    approval_policy: ApprovalPolicy = "none"
    trace_label: str | None = None


def _object_schema(properties: dict[str, Any], required: list[str] | None = None) -> dict[str, Any]:
    return {"type": "object", "properties": properties, "required": required or []}


TOOL_REGISTRY: dict[str, AgentToolDefinition] = {
    "generate_quiz": AgentToolDefinition(
        name="generate_quiz",
        description="Create a tracked quiz card.",
        input_schema=_object_schema({"concept": {"type": "string"}, "quiz_type": {"type": "string"}}, ["concept"]),
        output_schema=_object_schema({"quiz_id": {"type": "integer"}}),
    ),
    "save_key_idea": AgentToolDefinition(
        name="save_key_idea",
        description="Save a concise concept note for review.",
        input_schema=_object_schema({"concept": {"type": "string"}, "summary": {"type": "string"}}, ["concept", "summary"]),
        output_schema=_object_schema({"key_idea_id": {"type": "integer"}}),
    ),
    "create_diagram": AgentToolDefinition(
        name="create_diagram",
        description="Render a bounded educational Mermaid diagram.",
        input_schema=_object_schema({"source": {"type": "string"}, "title": {"type": "string"}}, ["source"]),
        output_schema=_object_schema({"diagram_id": {"type": "string"}}),
    ),
    "create_structured_diagram": AgentToolDefinition(
        name="create_structured_diagram",
        description="Render a polished instructional diagram from structured data.",
        input_schema=_object_schema(
            {
                "template": {"type": "string"},
                "title": {"type": "string"},
                "items": {"type": "array", "items": {"type": "string"}},
            },
            ["template", "title"],
        ),
        output_schema=_object_schema({"diagram_id": {"type": "string"}}),
    ),
    "find_image": AgentToolDefinition(
        name="find_image",
        description="Find a visual reference.",
        input_schema=_object_schema({"query": {"type": "string"}, "caption": {"type": "string"}}, ["query"]),
        output_schema=_object_schema({"image_url": {"type": "string"}}),
    ),
    "find_resource": AgentToolDefinition(
        name="find_resource",
        description="Find and save one external video or article.",
        input_schema=_object_schema({"topic": {"type": "string"}, "kind": {"type": "string"}}, ["topic", "kind"]),
        output_schema=_object_schema({"resource_id": {"type": "integer"}}),
    ),
    "retrieve_materials": AgentToolDefinition(
        name="retrieve_materials",
        description="Retrieve uploaded study material snippets.",
        input_schema=_object_schema({"query": {"type": "string"}, "subject": {"type": "string"}}, ["query"]),
        output_schema=_object_schema({"chunk_ids": {"type": "array", "items": {"type": "integer"}}}),
    ),
    "grade_answer": AgentToolDefinition(
        name="grade_answer",
        description="Grade a quiz answer.",
        input_schema=_object_schema({"quiz_id": {"type": "integer"}, "answer": {"type": "string"}}, ["quiz_id", "answer"]),
        output_schema=_object_schema({"is_correct": {"type": "boolean"}}),
    ),
    "update_mastery": AgentToolDefinition(
        name="update_mastery",
        description="Update BKT mastery from quiz evidence.",
        input_schema=_object_schema({"concept": {"type": "string"}, "evidence": {"type": "object"}}, ["concept"]),
        output_schema=_object_schema({"mastery": {"type": "number"}}),
    ),
    "recommend_next_topic": AgentToolDefinition(
        name="recommend_next_topic",
        description="Choose the next study topic from mastery and deadlines.",
        input_schema=_object_schema({"subject": {"type": "string"}}),
        output_schema=_object_schema({"topic": {"type": "string"}, "reason": {"type": "string"}}),
    ),
    "create_flashcards": AgentToolDefinition(
        name="create_flashcards",
        description="Create a small batch of flashcards.",
        input_schema=_object_schema({"subject": {"type": "string"}, "focus": {"type": "string"}, "count": {"type": "integer"}}),
        output_schema=_object_schema({"created": {"type": "integer"}}),
        approval_policy="user_approval_required",
    ),
    "schedule_review": AgentToolDefinition(
        name="schedule_review",
        description="Create a calendar reminder.",
        input_schema=_object_schema({"subject": {"type": "string"}, "due_at": {"type": "string"}, "title": {"type": "string"}}),
        output_schema=_object_schema({"assignment_id": {"type": "integer"}}),
        approval_policy="user_approval_required",
    ),
    "generate_review_digest": AgentToolDefinition(
        name="generate_review_digest",
        description="Build a review digest preview.",
        input_schema=_object_schema({"subject": {"type": "string"}, "trigger_type": {"type": "string"}}),
        output_schema=_object_schema({"subject": {"type": "string"}, "focus_topics": {"type": "array"}}),
    ),
    "send_review_digest_email": AgentToolDefinition(
        name="send_review_digest_email",
        description="Send a review digest email.",
        input_schema=_object_schema({"digest": {"type": "object"}, "to": {"type": "string"}}, ["digest", "to"]),
        output_schema=_object_schema({"provider_message_id": {"type": "string"}}),
        approval_policy="opt_in_required",
    ),
    "save_session_summary": AgentToolDefinition(
        name="save_session_summary",
        description="Persist a summary for the study session.",
        input_schema=_object_schema({"conversation_id": {"type": "integer"}, "summary": {"type": "object"}}, ["conversation_id", "summary"]),
        output_schema=_object_schema({"conversation_id": {"type": "integer"}}),
    ),
    "update_learning_map": AgentToolDefinition(
        name="update_learning_map",
        description="Edit the learning map structure or status.",
        input_schema=_object_schema({"subject": {"type": "string"}, "patch": {"type": "object"}}, ["subject", "patch"]),
        output_schema=_object_schema({"subject": {"type": "string"}}),
        approval_policy="user_approval_required",
    ),
}


def allowed_chat_tool_names() -> list[str]:
    return [
        "generate_quiz",
        "save_key_idea",
        "create_structured_diagram",
        "create_diagram",
        "find_image",
        "find_resource",
    ]


def tool_summaries(tool_names: list[str]) -> list[dict[str, str]]:
    summaries: list[dict[str, str]] = []
    for name in tool_names:
        tool = TOOL_REGISTRY.get(name)
        if tool:
            summaries.append({"name": tool.name, "approval_policy": tool.approval_policy, "description": tool.description})
    return summaries
