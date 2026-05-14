from typing import Any, TypedDict

from app.services.retriever import RetrievedChunk


class ChatTurn(TypedDict):
    role: str
    content: str


def build_responses_input(
    *,
    system_prompt: str,
    history: list[ChatTurn],
    user_query: str,
    retrieved_context: list[RetrievedChunk],
    preference_summary: str | None = None,
    preference_memories: list[str] | None = None,
) -> list[dict[str, Any]]:
    context_block = ""
    if retrieved_context:
        rendered_sources: list[str] = []
        for index, item in enumerate(retrieved_context, start=1):
            page_suffix = f", page {item.page_number}" if item.page_number is not None else ""
            rendered_sources.append(
                f"[Source {index}] {item.material_filename}{page_suffix}\n{item.content}"
            )
        context_block = "Relevant study material context:\n\n" + "\n\n".join(rendered_sources)

    system_sections = [
        system_prompt.strip(),
        "Use the conversation history when it helps.",
        "When study material context is provided, ground the answer in it and avoid inventing missing details.",
    ]
    if preference_summary and preference_summary.strip():
        system_sections.append(
            "Student preferences from prior feedback:\n"
            f"{preference_summary.strip()}\n\n"
            "Use these preferences to adapt communication style and tutoring strategy.\n"
            "Do not let them override correctness, safety, or the learning objective.\n"
            "For practice problems, prefer hints and scaffolding before final answers unless the user explicitly asks for the final answer."
        )
    clean_preference_memories = [item.strip() for item in (preference_memories or []) if item.strip()]
    if clean_preference_memories:
        system_sections.append(
            "Relevant prior feedback for this kind of task:\n"
            + "\n".join(f"- {item}" for item in clean_preference_memories[:3])
        )
    if context_block:
        system_sections.append(context_block)

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": "\n\n".join(section for section in system_sections if section),
        }
    ]

    for turn in history:
        messages.append(
            {
                "role": turn["role"],
                "content": turn["content"],
            }
        )

    messages.append(
        {
            "role": "user",
            "content": user_query,
        }
    )
    return messages
