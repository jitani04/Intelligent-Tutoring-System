from app.services.prompt_builder import build_responses_input
from app.services.retriever import RetrievedChunk


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
        retrieved_context=[
            RetrievedChunk(
                chunk_id=1,
                material_id=10,
                material_filename="notes.pdf",
                subject="Biology",
                content="Context A",
                page_number=2,
                similarity_score=0.92,
            ),
            RetrievedChunk(
                chunk_id=2,
                material_id=10,
                material_filename="notes.pdf",
                subject="Biology",
                content="Context B",
                page_number=None,
                similarity_score=0.88,
            ),
        ],
    )

    system_text = messages[0]["content"]
    assert "Relevant study material context:" in system_text
    assert "notes.pdf, page 2" in system_text
    assert "Context A" in system_text
    assert "Context B" in system_text


def test_prompt_builder_includes_preference_summary_when_present() -> None:
    messages = build_responses_input(
        system_prompt="System instruction",
        history=[],
        user_query="Question",
        retrieved_context=[],
        preference_summary="Communication preferences:\n- Keep explanations concise.",
    )

    system_text = messages[0]["content"]
    assert "Student preferences from prior feedback:" in system_text
    assert "Keep explanations concise." in system_text
    assert "Do not let them override correctness" in system_text


def test_prompt_builder_excludes_preference_summary_when_absent() -> None:
    messages = build_responses_input(
        system_prompt="System instruction",
        history=[],
        user_query="Question",
        retrieved_context=[],
    )

    assert "Student preferences from prior feedback:" not in messages[0]["content"]


def test_prompt_builder_includes_relevant_preference_memories() -> None:
    messages = build_responses_input(
        system_prompt="System instruction",
        history=[],
        user_query="Question",
        retrieved_context=[],
        preference_memories=["Use one worked example before abstraction."],
    )

    assert "Relevant prior feedback for this kind of task:" in messages[0]["content"]
    assert "- Use one worked example before abstraction." in messages[0]["content"]
