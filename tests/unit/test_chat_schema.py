from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.chat import ChatRequest
from app.schemas.message import MessageRead, MessageRoleSchema


def test_chat_request_accepts_valid_message() -> None:
    request = ChatRequest(message="Help me solve this equation.")
    assert request.message == "Help me solve this equation."


def test_chat_request_rejects_empty_message() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="")


def test_chat_request_accepts_retry_without_message() -> None:
    request = ChatRequest(retry_message_id=42)
    assert request.retry_message_id == 42
    assert request.message is None


def test_chat_request_requires_message_when_editing() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(edit_message_id=42)


def test_chat_request_rejects_retry_and_edit_together() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="Try this instead.", retry_message_id=1, edit_message_id=2)


def test_message_read_preserves_saved_diagram_and_image_artifacts() -> None:
    message = MessageRead(
        id=10,
        conversation_id=3,
        role=MessageRoleSchema.ASSISTANT,
        content="This is the explanation.",
        artifacts=[
            {
                "kind": "diagram",
                "data": {
                    "id": "diag1",
                    "source": "flowchart TD\nA[Start] --> B[Finish]",
                    "title": "Simple flow",
                },
            },
            {
                "kind": "structured_diagram",
                "data": {
                    "id": "struct1",
                    "template": "queue",
                    "title": "Queue",
                    "subtitle": "A queue follows",
                    "emphasis": "First In, First Out",
                    "items": ["10", "20", "30"],
                    "front_label": "FRONT",
                    "rear_label": "REAR",
                    "left_action": "DEQUEUE",
                    "right_action": "ENQUEUE",
                },
            },
            {
                "kind": "image",
                "data": {
                    "id": "img1",
                    "query": "server rack",
                    "caption": "A server rack.",
                    "image_url": "https://example.com/server.jpg",
                    "thumbnail_url": "https://example.com/server-thumb.jpg",
                },
            },
        ],
        created_at=datetime.now(timezone.utc),
    )

    assert message.artifacts is not None
    assert message.artifacts[0]["kind"] == "diagram"
    assert message.artifacts[0]["data"]["source"].startswith("flowchart TD")
    assert message.artifacts[1]["kind"] == "structured_diagram"
    assert message.artifacts[1]["data"]["template"] == "queue"
    assert message.artifacts[2]["kind"] == "image"
