import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.db.session import get_db_session
from app.models.lecture_note import LectureNote

logger = logging.getLogger(__name__)
router = APIRouter(tags=["lecture-notes"])

DbDep = Annotated[AsyncSession, Depends(get_db_session)]
UserDep = Annotated[int, Depends(get_user_id)]


class LectureNoteRead(BaseModel):
    id: int
    conversation_id: int | None
    subject: str | None
    title: str
    timeline: list[dict[str, Any]]
    created_at: str

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm(cls, obj: LectureNote) -> "LectureNoteRead":
        return cls(
            id=obj.id,
            conversation_id=obj.conversation_id,
            subject=obj.subject,
            title=obj.title,
            timeline=obj.timeline,
            created_at=obj.created_at.isoformat(),
        )


class LectureNoteSummary(BaseModel):
    id: int
    conversation_id: int | None
    subject: str | None
    title: str
    entry_count: int
    created_at: str


class LectureNoteCreate(BaseModel):
    conversation_id: int | None = None
    subject: str | None = None
    title: str = Field(min_length=1, max_length=512)
    timeline: list[dict[str, Any]]


@router.post("/lecture-notes", response_model=LectureNoteRead, status_code=status.HTTP_201_CREATED)
async def create_lecture_note(
    payload: LectureNoteCreate,
    user_id: UserDep,
    session: DbDep,
) -> LectureNoteRead:
    if not payload.timeline:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Lecture timeline is empty.",
        )
    subject = payload.subject.strip() if payload.subject and payload.subject.strip() else None
    note = LectureNote(
        user_id=user_id,
        conversation_id=payload.conversation_id,
        subject=subject,
        title=payload.title.strip(),
        timeline=payload.timeline,
    )
    session.add(note)
    await session.commit()
    await session.refresh(note)
    return LectureNoteRead.from_orm(note)


@router.get("/lecture-notes", response_model=list[LectureNoteSummary])
async def list_lecture_notes(
    user_id: UserDep,
    session: DbDep,
    subject: str | None = Query(None),
) -> list[LectureNoteSummary]:
    stmt = select(LectureNote).where(LectureNote.user_id == user_id)
    if subject and subject.strip():
        stmt = stmt.where(LectureNote.subject == subject.strip())
    stmt = stmt.order_by(LectureNote.created_at.desc())
    result = await session.execute(stmt)
    return [
        LectureNoteSummary(
            id=n.id,
            conversation_id=n.conversation_id,
            subject=n.subject,
            title=n.title,
            entry_count=len(n.timeline) if isinstance(n.timeline, list) else 0,
            created_at=n.created_at.isoformat(),
        )
        for n in result.scalars()
    ]


@router.get("/lecture-notes/{note_id}", response_model=LectureNoteRead)
async def get_lecture_note(
    note_id: int,
    user_id: UserDep,
    session: DbDep,
) -> LectureNoteRead:
    note = await session.get(LectureNote, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(status_code=404, detail="Lecture note not found.")
    return LectureNoteRead.from_orm(note)


@router.delete("/lecture-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lecture_note(
    note_id: int,
    user_id: UserDep,
    session: DbDep,
) -> None:
    note = await session.get(LectureNote, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(status_code=404, detail="Lecture note not found.")
    await session.delete(note)
    await session.commit()
