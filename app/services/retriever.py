from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.material import Material, MaterialStatus
from app.models.material_chunk import MaterialChunk
from app.services.embedding_service import create_embedding_service


@dataclass(slots=True)
class RetrievedChunk:
    chunk_id: int
    material_id: int
    material_filename: str
    subject: str | None
    content: str
    page_number: int | None
    similarity_score: float

    @property
    def snippet(self) -> str:
        if len(self.content) <= 220:
            return self.content
        return f"{self.content[:217].rstrip()}..."


async def retrieve_context(
    *,
    session: AsyncSession,
    user_id: int,
    conversation_id: int,
    query: str,
) -> list[RetrievedChunk]:
    _ = conversation_id
    settings = get_settings()

    ready_material = await session.execute(
        select(Material.id)
        .where(Material.user_id == user_id, Material.status == MaterialStatus.READY)
        .limit(1)
    )
    if ready_material.scalar_one_or_none() is None:
        return []

    embedding_service = create_embedding_service()
    query_embedding = await embedding_service.embed_query(query)
    distance = MaterialChunk.embedding.cosine_distance(query_embedding)

    result = await session.execute(
        select(MaterialChunk, Material, distance.label("distance"))
        .join(Material, Material.id == MaterialChunk.material_id)
        .where(Material.user_id == user_id, Material.status == MaterialStatus.READY)
        .order_by(distance.asc(), MaterialChunk.chunk_index.asc())
        .limit(settings.rag_top_k * 4)
    )

    per_material_limit = 2
    per_material_counts: dict[int, int] = {}
    chunks: list[RetrievedChunk] = []

    for chunk, material, raw_distance in result.all():
        if per_material_counts.get(material.id, 0) >= per_material_limit:
            continue

        per_material_counts[material.id] = per_material_counts.get(material.id, 0) + 1
        chunks.append(
            RetrievedChunk(
                chunk_id=chunk.id,
                material_id=material.id,
                material_filename=material.filename,
                subject=material.subject,
                content=chunk.content,
                page_number=chunk.page_number,
                similarity_score=max(0.0, 1.0 - float(raw_distance)),
            )
        )
        if len(chunks) >= settings.rag_top_k:
            break

    return chunks
