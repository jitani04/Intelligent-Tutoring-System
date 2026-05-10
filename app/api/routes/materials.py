from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_user
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.material import MaterialRead
from app.services import s3_client
from app.services.errors import MaterialNotFoundError
from app.services.material_service import (
    build_upload_key,
    create_material_from_key,
    delete_material,
    get_material_for_user,
    list_materials_for_user,
    process_material_ingestion,
    sanitize_filename,
    validate_material_filename,
)

router = APIRouter(prefix="/materials", tags=["materials"])
settings = get_settings()
_upload_rate_limit = Depends(rate_limit_user("upload", settings.rate_limit_upload_per_min))


class PresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=255)


class PresignResponse(BaseModel):
    upload_url: str
    key: str
    expires_in: int
    max_bytes: int
    required_headers: dict[str, str]


class MaterialCreate(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=255)
    subject: str | None = Field(default=None, max_length=255)
    key: str = Field(min_length=1, max_length=1024)


class MaterialPreviewResponse(BaseModel):
    url: str
    expires_in: int
    mime_type: str
    filename: str


async def _ensure_user_exists(*, session: AsyncSession, user_id: int) -> None:
    result = await session.execute(select(User.id).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")


@router.get("", response_model=list[MaterialRead])
async def list_materials_endpoint(
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    subject: str | None = None,
) -> list[MaterialRead]:
    materials = await list_materials_for_user(session=session, user_id=user_id, subject=subject)
    return [MaterialRead.model_validate(material) for material in materials]


@router.post("/presign", response_model=PresignResponse, dependencies=[_upload_rate_limit])
async def presign_upload_endpoint(
    payload: PresignRequest,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> PresignResponse:
    await _ensure_user_exists(session=session, user_id=user_id)

    clean = sanitize_filename(payload.filename)
    try:
        validate_material_filename(clean)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    key = build_upload_key(user_id=user_id, filename=clean)
    presigned = await s3_client.generate_presigned_put(
        key=key,
        content_type=payload.mime_type or "application/octet-stream",
        max_bytes=settings.upload_max_bytes,
    )
    return PresignResponse(
        upload_url=presigned["upload_url"],
        key=presigned["key"],
        expires_in=presigned["expires_in"],
        max_bytes=settings.upload_max_bytes,
        required_headers=presigned["required_headers"],
    )


@router.post(
    "",
    response_model=MaterialRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[_upload_rate_limit],
)
async def create_material_endpoint(
    payload: MaterialCreate,
    background_tasks: BackgroundTasks,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MaterialRead:
    await _ensure_user_exists(session=session, user_id=user_id)

    try:
        material = await create_material_from_key(
            session=session,
            user_id=user_id,
            filename=payload.filename,
            mime_type=payload.mime_type,
            subject=payload.subject,
            key=payload.key,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    background_tasks.add_task(process_material_ingestion, material.id)
    return MaterialRead.model_validate(material)


@router.get("/{material_id}/preview-url", response_model=MaterialPreviewResponse)
async def get_material_preview_url(
    material_id: int,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> MaterialPreviewResponse:
    try:
        material = await get_material_for_user(session=session, user_id=user_id, material_id=material_id)
    except MaterialNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found.") from exc

    url = await s3_client.generate_presigned_get(
        key=material.storage_path,
        expires_in=settings.preview_url_expires_seconds,
        filename=material.filename,
        content_type=material.mime_type,
    )
    return MaterialPreviewResponse(
        url=url,
        expires_in=settings.preview_url_expires_seconds,
        mime_type=material.mime_type,
        filename=material.filename,
    )


@router.delete("/{material_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_material_endpoint(
    material_id: int,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> Response:
    try:
        await delete_material(session=session, user_id=user_id, material_id=material_id)
    except MaterialNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found.") from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
