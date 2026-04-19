import pytest
from pydantic import ValidationError

from app.schemas.chat import ChatRequest


def test_chat_request_accepts_valid_message() -> None:
    request = ChatRequest(message="Help me solve this equation.")
    assert request.message == "Help me solve this equation."


def test_chat_request_rejects_empty_message() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(message="")
