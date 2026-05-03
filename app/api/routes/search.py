import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.db.session import get_db_session
from app.models.conversation import Conversation
from app.models.key_idea import KeyIdea
from app.models.material import Material
from app.models.material_chunk import MaterialChunk
from app.models.message import Message, MessageRole

logger = logging.getLogger(__name__)
router = APIRouter(tags=["search"])


class SessionResult(BaseModel):
    conversation_id: int
    subject: str | None
    message_id: int
    snippet: str
    created_at: str


class NoteResult(BaseModel):
    id: int
    concept: str
    subject: str | None
    snippet: str


class MaterialResult(BaseModel):
    material_id: int
    filename: str
    snippet: str
    page_number: int | None


class SearchResponse(BaseModel):
    sessions: list[SessionResult]
    notes: list[NoteResult]
    materials: list[MaterialResult]


def _snippet(text: str, query: str, window: int = 150) -> str:
    pos = text.lower().find(query.lower())
    if pos == -1:
        return (text[:window] + "…") if len(text) > window else text
    start = max(0, pos - window // 2)
    end = min(len(text), pos + len(query) + window // 2)
    result = text[start:end]
    if start > 0:
        result = "…" + result
    if end < len(text):
        result = result + "…"
    return result


DbDep = Annotated[AsyncSession, Depends(get_db_session)]
UserDep = Annotated[int, Depends(get_user_id)]


@router.get("/search", response_model=SearchResponse)
async def search(
    user_id: UserDep,
    session: DbDep,
    q: str = Query("", max_length=200),
) -> SearchResponse:
    q = q.strip()
    if len(q) < 2:
        return SearchResponse(sessions=[], notes=[], materials=[])

    pattern = f"%{q}%"

    # Sessions — search user messages
    msg_rows = await session.execute(
        select(Message, Conversation)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Conversation.user_id == user_id,
            Message.role == MessageRole.USER,
            Message.content.ilike(pattern),
        )
        .order_by(Message.created_at.desc())
        .limit(8)
    )
    session_results = [
        SessionResult(
            conversation_id=conv.id,
            subject=conv.subject,
            message_id=msg.id,
            snippet=_snippet(msg.content, q),
            created_at=msg.created_at.isoformat(),
        )
        for msg, conv in msg_rows
    ]

    # Notes — search key ideas
    note_rows = await session.execute(
        select(KeyIdea)
        .where(
            KeyIdea.user_id == user_id,
            or_(KeyIdea.concept.ilike(pattern), KeyIdea.summary.ilike(pattern)),
        )
        .order_by(KeyIdea.created_at.desc())
        .limit(8)
    )
    note_results = [
        NoteResult(
            id=ki.id,
            concept=ki.concept,
            subject=ki.subject,
            snippet=_snippet(
                ki.summary if ki.summary.lower().find(q.lower()) != -1 else ki.concept,
                q,
            ),
        )
        for ki in note_rows.scalars()
    ]

    # Materials — search chunks, one result per material
    chunk_rows = await session.execute(
        select(MaterialChunk, Material)
        .join(Material, Material.id == MaterialChunk.material_id)
        .where(
            Material.user_id == user_id,
            MaterialChunk.content.ilike(pattern),
        )
        .order_by(Material.created_at.desc())
        .limit(20)
    )
    seen: set[int] = set()
    material_results: list[MaterialResult] = []
    for chunk, mat in chunk_rows:
        if mat.id in seen:
            continue
        seen.add(mat.id)
        material_results.append(
            MaterialResult(
                material_id=mat.id,
                filename=mat.filename,
                snippet=_snippet(chunk.content, q),
                page_number=chunk.page_number,
            )
        )
        if len(material_results) == 8:
            break

    return SearchResponse(sessions=session_results, notes=note_results, materials=material_results)
