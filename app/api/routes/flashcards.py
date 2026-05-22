import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.db.session import get_db_session
from app.models.key_idea import KeyIdea

logger = logging.getLogger(__name__)
router = APIRouter(tags=["flashcards"])

DbDep = Annotated[AsyncSession, Depends(get_db_session)]
UserDep = Annotated[int, Depends(get_user_id)]


class FlashcardRead(BaseModel):
    id: int
    concept: str
    summary: str
    subject: str | None
    sr_interval: int
    sr_repetitions: int
    sr_ease_factor: float
    sr_due_date: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, obj: KeyIdea) -> "FlashcardRead":
        return cls(
            id=obj.id,
            concept=obj.concept,
            summary=obj.summary,
            subject=obj.subject,
            sr_interval=obj.sr_interval,
            sr_repetitions=obj.sr_repetitions,
            sr_ease_factor=obj.sr_ease_factor,
            sr_due_date=obj.sr_due_date.isoformat(),
        )


class FlashcardDueResponse(BaseModel):
    cards: list[FlashcardRead]
    total_due: int


class ReviewRequest(BaseModel):
    quality: int = Field(ge=0, le=5)


def _sm2(interval: int, repetitions: int, ease_factor: float, quality: int) -> tuple[int, int, float]:
    """SM-2 algorithm. quality 0-5."""
    if quality < 3:
        new_interval = 1
        new_repetitions = 0
        new_ease = ease_factor
    else:
        if repetitions == 0:
            new_interval = 1
        elif repetitions == 1:
            new_interval = 6
        else:
            new_interval = round(interval * ease_factor)
        new_repetitions = repetitions + 1
        new_ease = max(1.3, ease_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    return new_interval, new_repetitions, new_ease


@router.get("/flashcards/due", response_model=FlashcardDueResponse)
async def get_due_flashcards(
    user_id: UserDep,
    session: DbDep,
    subject: str | None = None,
) -> FlashcardDueResponse:
    now = datetime.now(timezone.utc)
    query = (
        select(KeyIdea)
        .where(KeyIdea.user_id == user_id, KeyIdea.sr_due_date <= now)
        .order_by(KeyIdea.sr_due_date.asc())
    )
    if subject and subject.strip():
        query = query.where(func.lower(KeyIdea.subject) == subject.strip().lower())

    result = await session.execute(query)
    cards = result.scalars().all()
    return FlashcardDueResponse(
        cards=[FlashcardRead.from_orm(c) for c in cards],
        total_due=len(cards),
    )


@router.delete("/flashcards/{card_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(card_id: int, user_id: UserDep, session: DbDep) -> None:
    card = await session.get(KeyIdea, card_id)
    if not card or card.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flashcard not found.")
    await session.delete(card)
    await session.commit()


@router.post("/flashcards/{card_id}/review", response_model=FlashcardRead)
async def review_flashcard(
    card_id: int,
    body: ReviewRequest,
    user_id: UserDep,
    session: DbDep,
) -> FlashcardRead:
    card = await session.get(KeyIdea, card_id)
    if not card or card.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flashcard not found.")

    new_interval, new_reps, new_ease = _sm2(
        card.sr_interval, card.sr_repetitions, card.sr_ease_factor, body.quality
    )

    card.sr_interval = new_interval
    card.sr_repetitions = new_reps
    card.sr_ease_factor = new_ease
    card.sr_due_date = datetime.now(timezone.utc) + timedelta(days=new_interval)

    await session.commit()
    return FlashcardRead.from_orm(card)
