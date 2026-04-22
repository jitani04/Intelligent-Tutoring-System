from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.material import MaterialRead
from app.services.errors import MaterialNotFoundError
from app.services.material_service import (
    create_material,
    delete_material,
    list_materials_for_user,
    process_material_ingestion,
)

router = APIRouter(prefix="/materials", tags=["materials"])
settings = get_settings()


async def _ensure_user_exists(*, session: AsyncSession, user_id: int) -> None:
    result = await session.execute(select(User.id).where(User.id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")


@router.get("", response_model=list[MaterialRead])
async def list_materials_endpoint(
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[MaterialRead]:
    materials = await list_materials_for_user(session=session, user_id=user_id)
    return [MaterialRead.model_validate(material) for material in materials]


@router.post("", response_model=MaterialRead, status_code=status.HTTP_201_CREATED)
async def upload_material_endpoint(
    background_tasks: BackgroundTasks,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    file: Annotated[UploadFile, File(...)],
    subject: Annotated[str | None, Form()] = None,
) -> MaterialRead:
    await _ensure_user_exists(session=session, user_id=user_id)

    content = await file.read(settings.upload_max_bytes + 1)
    if len(content) > settings.upload_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Upload exceeds the {settings.upload_max_bytes} byte limit.",
        )

    try:
        material = await create_material(
            session=session,
            user_id=user_id,
            filename=file.filename or "upload",
            mime_type=file.content_type or "application/octet-stream",
            subject=subject,
            content=content,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    background_tasks.add_task(process_material_ingestion, material.id)
    return MaterialRead.model_validate(material)


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
