import asyncio
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db.session import get_session_factory
from app.models.material import Material, MaterialStatus
from app.models.material_chunk import MaterialChunk
from app.services.embedding_service import create_embedding_service
from app.services.errors import MaterialNotFoundError

SUPPORTED_SUFFIXES = {".pdf", ".txt", ".md"}


@dataclass(slots=True)
class ExtractedBlock:
    text: str
    page_number: int | None = None


@dataclass(slots=True)
class ChunkPayload:
    chunk_index: int
    content: str
    char_start: int
    char_end: int
    page_number: int | None


def _normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def sanitize_filename(filename: str) -> str:
    candidate = Path(filename or "upload").name.strip()
    return candidate or "upload"


def validate_material_filename(filename: str) -> None:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError("Only PDF, TXT, and MD uploads are supported.")


def build_storage_path(*, user_id: int, material_id: int, filename: str) -> Path:
    settings = get_settings()
    return settings.upload_dir / f"user-{user_id}" / f"material-{material_id}" / sanitize_filename(filename)


async def list_materials_for_user(*, session: AsyncSession, user_id: int) -> list[Material]:
    result = await session.execute(
        select(Material).where(Material.user_id == user_id).order_by(Material.created_at.desc(), Material.id.desc())
    )
    return list(result.scalars())


async def get_material_for_user(*, session: AsyncSession, user_id: int, material_id: int) -> Material:
    result = await session.execute(
        select(Material).where(Material.id == material_id, Material.user_id == user_id)
    )
    material = result.scalar_one_or_none()
    if material is None:
        raise MaterialNotFoundError
    return material


async def create_material(
    *,
    session: AsyncSession,
    user_id: int,
    filename: str,
    mime_type: str,
    subject: str | None,
    content: bytes,
) -> Material:
    clean_filename = sanitize_filename(filename)
    validate_material_filename(clean_filename)

    material = Material(
        user_id=user_id,
        filename=clean_filename,
        storage_path="",
        mime_type=mime_type or "application/octet-stream",
        subject=(subject or "").strip() or None,
        status=MaterialStatus.PROCESSING,
        error_message=None,
    )
    session.add(material)
    await session.flush()

    storage_path = build_storage_path(user_id=user_id, material_id=material.id, filename=clean_filename)

    try:
        await asyncio.to_thread(storage_path.parent.mkdir, 0o755, True, True)
        await asyncio.to_thread(storage_path.write_bytes, content)
        material.storage_path = str(storage_path)
        await session.commit()
        await session.refresh(material)
        return material
    except Exception:
        await session.rollback()
        await asyncio.to_thread(_remove_material_dir, storage_path.parent)
        raise


async def delete_material(*, session: AsyncSession, user_id: int, material_id: int) -> None:
    material = await get_material_for_user(session=session, user_id=user_id, material_id=material_id)
    material_dir = Path(material.storage_path).parent
    await session.delete(material)
    await session.commit()
    await asyncio.to_thread(_remove_material_dir, material_dir)


async def process_material_ingestion(material_id: int) -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(select(Material).where(Material.id == material_id))
        material = result.scalar_one_or_none()
        if material is None:
            return

        try:
            chunks = await build_chunks_for_material(material)
            if not chunks:
                raise ValueError("No readable text found in the uploaded material.")

            embedding_service = create_embedding_service()
            embeddings = await embedding_service.embed_documents([chunk.content for chunk in chunks])
            await session.execute(delete(MaterialChunk).where(MaterialChunk.material_id == material.id))
            session.add_all(
                [
                    MaterialChunk(
                        material_id=material.id,
                        chunk_index=chunk.chunk_index,
                        content=chunk.content,
                        embedding=embedding,
                        char_start=chunk.char_start,
                        char_end=chunk.char_end,
                        page_number=chunk.page_number,
                    )
                    for chunk, embedding in zip(chunks, embeddings, strict=True)
                ]
            )
            material.status = MaterialStatus.READY
            material.error_message = None
            material.processed_at = datetime.now(timezone.utc)
            await session.commit()
        except Exception as exc:
            await session.rollback()
            await mark_material_failed(material_id=material_id, error_message=str(exc))


async def mark_material_failed(*, material_id: int, error_message: str) -> None:
    session_factory = get_session_factory()
    async with session_factory() as session:
        result = await session.execute(select(Material).where(Material.id == material_id))
        material = result.scalar_one_or_none()
        if material is None:
            return

        material.status = MaterialStatus.FAILED
        material.error_message = error_message[:500]
        material.processed_at = datetime.now(timezone.utc)
        await session.commit()


async def build_chunks_for_material(material: Material) -> list[ChunkPayload]:
    settings = get_settings()
    blocks = await extract_material_blocks(Path(material.storage_path))
    return chunk_blocks(
        blocks,
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
    )


async def extract_material_blocks(path: Path) -> list[ExtractedBlock]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return await asyncio.to_thread(_extract_pdf_blocks, path)

    content = await asyncio.to_thread(path.read_bytes)
    text = content.decode("utf-8", errors="ignore")
    normalized = _normalize_text(text)
    if not normalized:
        return []
    return [ExtractedBlock(text=normalized)]


def chunk_blocks(blocks: list[ExtractedBlock], *, chunk_size: int, chunk_overlap: int) -> list[ChunkPayload]:
    if chunk_size <= 0:
        raise ValueError("Chunk size must be positive.")
    if chunk_overlap < 0 or chunk_overlap >= chunk_size:
        raise ValueError("Chunk overlap must be between 0 and chunk size - 1.")

    chunks: list[ChunkPayload] = []
    chunk_index = 0
    step = chunk_size - chunk_overlap

    for block in blocks:
        if not block.text:
            continue

        start = 0
        text_length = len(block.text)
        while start < text_length:
            end = min(text_length, start + chunk_size)
            content = block.text[start:end].strip()
            if content:
                chunks.append(
                    ChunkPayload(
                        chunk_index=chunk_index,
                        content=content,
                        char_start=start,
                        char_end=end,
                        page_number=block.page_number,
                    )
                )
                chunk_index += 1

            if end >= text_length:
                break
            start += step

    return chunks


def _extract_pdf_blocks(path: Path) -> list[ExtractedBlock]:
    reader = PdfReader(str(path))
    blocks: list[ExtractedBlock] = []
    for index, page in enumerate(reader.pages, start=1):
        normalized = _normalize_text(page.extract_text() or "")
        if normalized:
            blocks.append(ExtractedBlock(text=normalized, page_number=index))
    return blocks


def _remove_material_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
