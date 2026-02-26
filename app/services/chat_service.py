import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message, MessageRole
from app.services import retriever
from app.services.conversation_service import get_conversation_for_user
from app.services.llm_service import LLMService
from app.services.prompt_builder import ChatTurn, build_responses_input

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class SseEvent:
    event: str
    data: dict[str, Any]


async def stream_chat(
    *,
    session: AsyncSession,
    llm_service: LLMService,
    conversation_id: int,
    user_id: int,
    user_message: str,
    system_prompt: str,
) -> AsyncIterator[SseEvent]:
    await get_conversation_for_user(session=session, conversation_id=conversation_id, user_id=user_id)

    user_msg = Message(conversation_id=conversation_id, role=MessageRole.USER, content=user_message)
    session.add(user_msg)
    await session.commit()
    await session.refresh(user_msg)

    history_result = await session.execute(
        select(Message).where(Message.conversation_id == conversation_id).order_by(Message.created_at.asc(), Message.id.asc())
    )
    history_messages = list(history_result.scalars())

    retrieved_context = await retriever.retrieve_context(user_message)

    history_turns: list[ChatTurn] = [
        {"role": msg.role.value, "content": msg.content}
        for msg in history_messages
        if msg.id != user_msg.id
    ]

    input_messages = build_responses_input(
        system_prompt=system_prompt,
        history=history_turns,
        user_query=user_message,
        retrieved_context=retrieved_context,
    )

    yield SseEvent(event="start", data={"conversation_id": conversation_id, "message_id": None})

    assistant_parts: list[str] = []
    usage: dict[str, Any] | None = None

    try:
        async for event in llm_service.stream_response(input_messages=input_messages):
            if event.type == "token" and event.delta:
                assistant_parts.append(event.delta)
                yield SseEvent(event="token", data={"delta": event.delta})
            elif event.type == "completed":
                usage = event.usage

        assistant_content = "".join(assistant_parts).strip()
        if not assistant_content:
            assistant_content = "(No response content)"

        assistant_msg = Message(
            conversation_id=conversation_id,
            role=MessageRole.ASSISTANT,
            content=assistant_content,
        )
        session.add(assistant_msg)
        await session.commit()
        await session.refresh(assistant_msg)

        yield SseEvent(
            event="end",
            data={
                "assistant_message_id": assistant_msg.id,
                "usage": usage,
            },
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Streaming chat failed", extra={"conversation_id": conversation_id, "user_id": user_id})
        await session.rollback()
        yield SseEvent(event="error", data={"error": str(exc)})
