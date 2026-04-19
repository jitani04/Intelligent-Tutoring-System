from typing import Any, TypedDict


class ChatTurn(TypedDict):
    role: str
    content: str


def build_responses_input(
    *,
    system_prompt: str,
    history: list[ChatTurn],
    user_query: str,
    retrieved_context: list[str],
) -> list[dict[str, Any]]:
    context_block = ""
    if retrieved_context:
        context_lines = "\n".join(f"- {item}" for item in retrieved_context)
        context_block = f"Relevant context:\n{context_lines}"

    system_sections = [
        system_prompt.strip(),
        "Use the conversation history when it helps.",
    ]
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
