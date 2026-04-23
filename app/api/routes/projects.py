import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.project_profile import ProjectProfile
from app.schemas.project import ProjectProfileRead, ProjectSetupRequest
from app.services.llm_service import LLMService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["projects"])


async def _get_or_create_profile(
    session: AsyncSession, user_id: int, subject: str
) -> ProjectProfile:
    result = await session.execute(
        select(ProjectProfile).where(
            ProjectProfile.user_id == user_id,
            ProjectProfile.subject == subject,
        )
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = ProjectProfile(user_id=user_id, subject=subject)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)
    return profile


@router.get("/{subject}", response_model=ProjectProfileRead)
async def get_project_profile(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)
    return ProjectProfileRead.model_validate(profile)


@router.post("/{subject}/setup", response_model=ProjectProfileRead)
async def setup_project(
    subject: str,
    body: ProjectSetupRequest,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)
    profile.level = body.level
    profile.goals = body.goals
    await session.commit()
    await session.refresh(profile)
    return ProjectProfileRead.model_validate(profile)


@router.post("/{subject}/mindmap", response_model=ProjectProfileRead)
async def generate_mindmap(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)

    settings = get_settings()
    llm = LLMService(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
    )

    level_str = f" at {profile.level} level" if profile.level else ""
    goals_str = f" Goals: {profile.goals}." if profile.goals else ""

    prompt = (
        f'Generate a mind map for a student studying "{subject}"{level_str}.{goals_str} '
        f"Return ONLY a valid JSON object with this exact structure, no markdown, no explanation:\n"
        f'{{"subject":"{subject}","nodes":['
        f'{{"topic":"Main Topic","subtopics":["Subtopic 1","Subtopic 2","Subtopic 3"]}}]}}\n'
        f"Include 4-6 main topics with 3-5 subtopics each, appropriate for the student's level and goals."
    )

    lc_messages = llm.to_langchain_messages([
        {"role": "system", "content": "You are a curriculum expert. Output only valid JSON, nothing else."},
        {"role": "user", "content": prompt},
    ])

    response = await llm._llm.ainvoke(lc_messages)
    raw = response.content if isinstance(response.content, str) else ""

    # Strip markdown code fences if present
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        mind_map: dict[str, Any] = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Mind map JSON parse failed, raw: %s", raw[:200])
        raise HTTPException(status_code=502, detail="Failed to generate mind map. Try again.")

    profile.mind_map = mind_map
    await session.commit()
    await session.refresh(profile)
    return ProjectProfileRead.model_validate(profile)
