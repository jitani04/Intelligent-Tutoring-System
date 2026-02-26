from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import Conversation
from app.services.errors import ConversationNotFoundError


async def create_conversation(*, session: AsyncSession, user_id: int) -> Conversation:
    conversation = Conversation(user_id=user_id)
    session.add(conversation)
    await session.commit()
    await session.refresh(conversation)
    return conversation


async def get_conversation_for_user(*, session: AsyncSession, conversation_id: int, user_id: int) -> Conversation:
    result = await session.execute(
        select(Conversation)
        .where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        .options(selectinload(Conversation.messages))
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise ConversationNotFoundError
    return conversation
