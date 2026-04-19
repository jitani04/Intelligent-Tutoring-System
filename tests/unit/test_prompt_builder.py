from app.services.prompt_builder import build_responses_input


def test_prompt_builder_includes_system_and_user_message() -> None:
    messages = build_responses_input(
        system_prompt="System instruction",
        history=[{"role": "assistant", "content": "Hello"}],
        user_query="How are you?",
        retrieved_context=[],
    )

    assert messages[0]["role"] == "system"
    assert "System instruction" in messages[0]["content"]
    assert messages[-1]["role"] == "user"
    assert messages[-1]["content"] == "How are you?"


def test_prompt_builder_includes_context_when_provided() -> None:
    messages = build_responses_input(
        system_prompt="System instruction",
        history=[],
        user_query="Question",
        retrieved_context=["Context A", "Context B"],
    )

    system_text = messages[0]["content"]
    assert "Relevant context:" in system_text
    assert "Context A" in system_text
    assert "Context B" in system_text
