import pytest

from app.services.chat_service import (
    _deterministic_empty_response_fallback,
    _empty_tool_response_recovery_prompt,
    _generate_empty_tool_response_recovery,
)
from app.services.llm_service import LLMStreamEvent


class _FakeLLMService:
    def __init__(self, events: list[LLMStreamEvent]) -> None:
        self.events = events
        self.input_messages = None

    async def stream_response(self, *, input_messages):
        self.input_messages = input_messages
        for event in self.events:
            yield event


def test_empty_tool_response_recovery_prompt_uses_tool_context() -> None:
    prompt = _empty_tool_response_recovery_prompt(
        user_message="Give me an intro to this topic",
        subject="Statistics",
        tool_calls_data=[
            {
                "name": "save_key_idea",
                "args": {"concept": "Sampling Error", "summary": "A sample differs from a population."},
            }
        ],
    )

    assert "Student request: Give me an intro to this topic" in prompt
    assert "Subject/topic hint: Sampling Error" in prompt
    assert "saved key idea: Sampling Error" in prompt
    assert "Do not call tools" in prompt


@pytest.mark.asyncio
async def test_empty_tool_response_recovery_returns_visible_text_without_tool_markup() -> None:
    fake_llm = _FakeLLMService(
        [
            LLMStreamEvent(type="token", delta="<tool_code>save_key_idea()</tool_code>"),
            LLMStreamEvent(type="token", delta="Start with the main idea."),
            LLMStreamEvent(type="completed", usage={"input_tokens": 10, "output_tokens": 6}),
        ]
    )

    text, usage = await _generate_empty_tool_response_recovery(
        llm_service=fake_llm,
        input_messages=[{"role": "system", "content": "Tutor."}, {"role": "user", "content": "Intro please."}],
        user_message="Intro please.",
        subject="Statistics",
        tool_calls_data=[{"name": "generate_quiz", "args": {"concept": "Mean"}}],
    )

    assert text == "Start with the main idea."
    assert usage == {"input_tokens": 10, "output_tokens": 6}
    assert fake_llm.input_messages[-1]["role"] == "user"
    assert "created quiz card: Mean" in fake_llm.input_messages[-1]["content"]


def test_deterministic_empty_response_fallback_never_uses_placeholder() -> None:
    text = _deterministic_empty_response_fallback(
        user_message="Give me an intro to this topic",
        subject="Systems Analysis",
        tool_calls_data=[],
    )

    assert "(No response content)" not in text
    assert "Systems Analysis" in text
