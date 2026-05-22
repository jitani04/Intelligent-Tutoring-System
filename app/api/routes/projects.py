import json
import logging
import mimetypes
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.exc import StaleDataError

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_user
from app.db.session import get_db_session
from app.models.key_idea import KeyIdea
from app.models.material import Material
from app.models.material_chunk import MaterialChunk
from app.models.message import Message
from app.models.message_feedback import MessageFeedback
from app.models.preference_memory import PreferenceMemory
from app.models.conversation import Conversation
from app.models.project_profile import ProjectProfile
from app.models.quiz import Quiz, QuizAttempt
from app.models.resource import Resource
from app.schemas.project import (
    LearningMapProgressUpdate,
    ProjectMindMapUpdate,
    ProjectCoverImageOption,
    ProjectProfileRead,
    ProjectProgressRead,
    ProjectSetupRequest,
)
from app.schemas.quiz import QuizRead, WeakQuizResponse
from app.services import s3_client
from app.services.knowledge_tracing_service import knowledge_state_for_progress
from app.services.llm_service import create_llm_service
from app.services.stock_image_service import StockImageError, StockImageService

ALLOWED_COVER_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}
MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024
LEARNING_MAP_STATUSES = {"not_started", "in_progress", "needs_review", "mastered"}
_FLASHCARD_FRONT_MAX_CHARS = 90
_FLASHCARD_DEFINITION_MARKERS = (
    " this is ",
    " this refers ",
    " this means ",
    " is a ",
    " is an ",
    " is the ",
    " are ",
    " refers to ",
    " used to ",
    " used for ",
    " represents ",
)


def _extract_json_array(raw: str) -> list:
    raw = raw.strip()
    start = raw.find("[")
    end = raw.rfind("]")
    if start == -1 or end == -1:
        raise ValueError("No JSON array found in response")
    data = json.loads(raw[start : end + 1])
    if not isinstance(data, list):
        raise ValueError("Expected a JSON array")
    return data


def _extract_json_object(raw: str) -> dict:
    raw = raw.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object found in response")
    data = json.loads(raw[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("Expected a JSON object")
    return data


def _clean_flashcard_front(value: Any) -> str:
    front = str(value or "").strip()
    front = " ".join(front.split())
    for separator in (":", " - ", " — ", " – "):
        if separator in front:
            before, after = front.split(separator, 1)
            if before.strip() and len(after.strip()) >= 16:
                front = before.strip()
                break
    return front[:_FLASHCARD_FRONT_MAX_CHARS].strip()


def _is_valid_flashcard_front(front: str) -> bool:
    if not front:
        return False
    lowered = f" {front.lower()} "
    if any(marker in lowered for marker in _FLASHCARD_DEFINITION_MARKERS):
        return False
    if len(front) > _FLASHCARD_FRONT_MAX_CHARS:
        return False
    word_count = len(front.split())
    if front.endswith("?"):
        return word_count <= 18
    if "____" in front or "..." in front:
        return word_count <= 18
    return word_count <= 8


def _validate_mind_map_payload(mind_map: dict[str, Any]) -> None:
    if not isinstance(mind_map.get("subject"), str) or not mind_map["subject"].strip():
        raise HTTPException(status_code=400, detail="Mind map subject is required.")
    nodes = mind_map.get("nodes")
    if not isinstance(nodes, list):
        raise HTTPException(status_code=400, detail="Mind map nodes must be a list.")

    ids: set[str] = set()
    prerequisites_by_id: dict[str, list[str]] = {}
    for index, node in enumerate(nodes):
        if not isinstance(node, dict):
            raise HTTPException(status_code=400, detail="Each mind map node must be an object.")
        topic = str(node.get("topic", "")).strip()
        node_id = str(node.get("id", "")).strip()
        if not topic:
            raise HTTPException(status_code=400, detail="Each topic needs a title.")
        if not node_id:
            raise HTTPException(status_code=400, detail="Each topic needs a stable ID.")
        if node_id in ids:
            raise HTTPException(status_code=400, detail="Mind map topic IDs must be unique.")
        ids.add(node_id)
        prerequisites = node.get("prerequisite_ids") or []
        if not isinstance(prerequisites, list):
            raise HTTPException(status_code=400, detail="Prerequisites must be a list.")
        prerequisites_by_id[node_id] = [str(item) for item in prerequisites]
        status_value = node.get("status")
        if status_value is not None and status_value not in LEARNING_MAP_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid learning map status.")
        node["order"] = int(node.get("order", index))

    for node_id, prerequisites in prerequisites_by_id.items():
        for prerequisite_id in prerequisites:
            if prerequisite_id not in ids:
                raise HTTPException(status_code=400, detail="Prerequisite topic does not exist.")
            if prerequisite_id == node_id:
                raise HTTPException(status_code=400, detail="A topic cannot require itself.")

    def visits_cycle(start_id: str, current_id: str, seen: set[str]) -> bool:
        for prerequisite_id in prerequisites_by_id.get(current_id, []):
            if prerequisite_id == start_id:
                return True
            if prerequisite_id in seen:
                continue
            seen.add(prerequisite_id)
            if visits_cycle(start_id, prerequisite_id, seen):
                return True
        return False

    if any(visits_cycle(node_id, node_id, set()) for node_id in ids):
        raise HTTPException(status_code=400, detail="This connection would create a circular prerequisite path.")

logger = logging.getLogger(__name__)
_project_settings = get_settings()
_summary_rate_limit = Depends(rate_limit_user("summary", _project_settings.rate_limit_summary_per_min))
router = APIRouter(prefix="/projects", tags=["projects"])


async def _hydrate_profile_cover_url(profile: ProjectProfile) -> ProjectProfileRead:
    read = ProjectProfileRead.model_validate(profile)
    if profile.cover_image_storage_key:
        settings = get_settings()
        try:
            read.cover_image_url = await s3_client.generate_presigned_get(
                key=profile.cover_image_storage_key,
                expires_in=settings.preview_url_expires_seconds,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed to presign cover image for profile %s", profile.id)
            read.cover_image_url = None
    return read


def _project_quizzes_query(user_id: int, subject: str):
    return (
        select(Quiz)
        .join(Conversation, Conversation.id == Quiz.conversation_id)
        .where(
            Conversation.user_id == user_id,
            Conversation.subject == subject,
        )
        .order_by(Quiz.created_at.desc(), Quiz.id.desc())
    )


GENERAL_SUBJECT_LABELS = {"general", ""}


def _is_general_subject(subject: str | None) -> bool:
    """The UI labels NULL-subject conversations as 'General'. That label is
    a display fallback, not a real subject — refuse to persist a profile for it."""
    if subject is None:
        return True
    return subject.strip().lower() in GENERAL_SUBJECT_LABELS


async def _get_or_create_profile(
    session: AsyncSession, user_id: int, subject: str
) -> ProjectProfile:
    if _is_general_subject(subject):
        raise HTTPException(
            status_code=404,
            detail=(
                "'General' is a placeholder for untagged conversations, not a real subject. "
                "Give the conversation a subject to enable project features."
            ),
        )
    result = await session.execute(
        select(ProjectProfile).where(
            ProjectProfile.user_id == user_id,
            ProjectProfile.subject == subject,
        )
    )
    profile = result.scalar_one_or_none()
    if profile is not None:
        return profile

    # Use INSERT ... ON CONFLICT DO NOTHING so concurrent requests racing to create
    # the same profile don't collide with a UniqueViolationError.
    await session.execute(
        pg_insert(ProjectProfile)
        .values(user_id=user_id, subject=subject)
        .on_conflict_do_nothing(constraint="uq_project_profile_user_subject")
    )
    await session.commit()

    result = await session.execute(
        select(ProjectProfile).where(
            ProjectProfile.user_id == user_id,
            ProjectProfile.subject == subject,
        )
    )
    return result.scalar_one()


@router.get("", response_model=list[ProjectProfileRead])
async def list_project_profiles(
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[ProjectProfileRead]:
    result = await session.execute(
        select(ProjectProfile)
        .where(ProjectProfile.user_id == user_id)
        .order_by(ProjectProfile.updated_at.desc(), ProjectProfile.subject.asc())
    )
    return [await _hydrate_profile_cover_url(profile) for profile in result.scalars()]


class CoverImagePresignRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=255)


class CoverImagePresignResponse(BaseModel):
    upload_url: str
    storage_key: str
    expires_in: int
    max_bytes: int
    required_headers: dict[str, str]


@router.post("/cover-images/presign", response_model=CoverImagePresignResponse)
async def presign_cover_image_upload(
    body: CoverImagePresignRequest,
    user_id: Annotated[int, Depends(get_user_id)],
) -> CoverImagePresignResponse:
    mime = body.mime_type.split(";", 1)[0].strip().lower()
    if mime not in ALLOWED_COVER_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Cover image must be a JPEG, PNG, WebP, or GIF.",
        )

    suffix = mimetypes.guess_extension(mime) or ""
    # mimetypes returns .jpe for image/jpeg on some platforms; normalize.
    if suffix == ".jpe":
        suffix = ".jpg"
    key = f"cover-images/{user_id}/{uuid.uuid4().hex}{suffix}"

    presigned = await s3_client.generate_presigned_put(
        key=key,
        content_type=mime,
        max_bytes=MAX_COVER_IMAGE_BYTES,
    )
    return CoverImagePresignResponse(
        upload_url=presigned["upload_url"],
        storage_key=key,
        expires_in=presigned["expires_in"],
        max_bytes=MAX_COVER_IMAGE_BYTES,
        required_headers=presigned["required_headers"],
    )


@router.get("/cover-images/search", response_model=list[ProjectCoverImageOption])
async def search_cover_images(
    query: str,
    user_id: Annotated[int, Depends(get_user_id)],
) -> list[ProjectCoverImageOption]:
    del user_id
    cleaned = query.strip()
    if len(cleaned) < 2:
        raise HTTPException(status_code=400, detail="Query must be at least 2 characters.")

    settings = get_settings()
    service = StockImageService(pexels_api_key=settings.pexels_api_key)

    try:
        results = await service.search_photos(cleaned)
    except StockImageError as exc:
        if "not configured" in str(exc):
            raise HTTPException(status_code=503, detail=str(exc))
        raise HTTPException(status_code=502, detail="Cover image search failed. Try again.")

    return [ProjectCoverImageOption.model_validate(result) for result in results]


@router.get("/{subject}/progress", response_model=ProjectProgressRead)
async def get_project_progress(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProgressRead:
    conv_result = await session.execute(
        select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.subject == subject,
        )
    )
    conversations = list(conv_result.scalars())
    conv_ids = [c.id for c in conversations]

    quizzes_attempted = 0
    quizzes_passed = 0
    if conv_ids:
        attempt_result = await session.execute(
            select(QuizAttempt)
            .join(Quiz, Quiz.id == QuizAttempt.quiz_id)
            .where(Quiz.conversation_id.in_(conv_ids), QuizAttempt.user_id == user_id)
        )
        attempts = list(attempt_result.scalars())
        quizzes_attempted = len(attempts)
        quizzes_passed = sum(1 for a in attempts if a.is_correct)

    covered: set[str] = set()
    struggled: set[str] = set()
    next_review: list[str] = []
    latest_summary_ts = None
    profile_for_mastery = await _get_or_create_profile(session, user_id, subject)

    for c in conversations:
        if not c.summary:
            continue
        covered.update(c.summary.get("covered", []))
        struggled.update(c.summary.get("struggled_with", []))
        if latest_summary_ts is None or c.created_at > latest_summary_ts:
            latest_summary_ts = c.created_at
            next_review = c.summary.get("next_review", [])

    pass_rate = round(quizzes_passed / quizzes_attempted * 100, 1) if quizzes_attempted > 0 else None

    return ProjectProgressRead(
        total_sessions=len(conversations),
        sessions_with_summary=sum(1 for c in conversations if c.summary),
        quizzes_attempted=quizzes_attempted,
        quizzes_passed=quizzes_passed,
        pass_rate=pass_rate,
        concepts_covered=sorted(covered),
        weak_areas=sorted(struggled),
        next_review=next_review,
        knowledge_mastery=knowledge_state_for_progress(profile_for_mastery),
    )


@router.get("/{subject}/quizzes", response_model=list[QuizRead])
async def list_project_quizzes(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> list[QuizRead]:
    result = await session.execute(_project_quizzes_query(user_id=user_id, subject=subject))
    return [QuizRead.model_validate(quiz) for quiz in result.scalars()]


@router.get("/{subject}", response_model=ProjectProfileRead)
async def get_project_profile(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)
    return await _hydrate_profile_cover_url(profile)


@router.patch("/{subject}/learning-map/progress", response_model=ProjectProfileRead)
async def update_learning_map_progress(
    subject: str,
    body: LearningMapProgressUpdate,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    node_id = body.node_id.strip()
    if not node_id:
        raise HTTPException(status_code=400, detail="Learning map node is required.")
    if body.status not in LEARNING_MAP_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid learning map status.")

    profile = await _get_or_create_profile(session, user_id, subject)
    progress = dict(profile.learning_map_progress or {})
    progress[node_id] = body.status
    profile.learning_map_progress = progress
    try:
        await session.commit()
    except StaleDataError:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await session.refresh(profile)
    return await _hydrate_profile_cover_url(profile)


@router.put("/{subject}/mindmap", response_model=ProjectProfileRead)
async def update_project_mindmap(
    subject: str,
    body: ProjectMindMapUpdate,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    _validate_mind_map_payload(body.mind_map)
    if body.learning_map_progress:
        invalid_statuses = [
            status_value for status_value in body.learning_map_progress.values()
            if status_value not in LEARNING_MAP_STATUSES
        ]
        if invalid_statuses:
            raise HTTPException(status_code=400, detail="Invalid learning map status.")

    profile = await _get_or_create_profile(session, user_id, subject)
    profile.mind_map = body.mind_map
    profile.learning_map_progress = body.learning_map_progress or {}
    try:
        await session.commit()
    except StaleDataError:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await session.refresh(profile)
    return await _hydrate_profile_cover_url(profile)


@router.delete("/{subject}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_subject(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> None:
    cleaned_subject = subject.strip()
    if not cleaned_subject:
        raise HTTPException(status_code=400, detail="Subject is required.")

    # "General" is the UI label for NULL-subject content. Deleting it should
    # also clear the user's untagged conversations and materials, so the sidebar
    # group disappears after the delete.
    deleting_general = _is_general_subject(cleaned_subject)
    if deleting_general:
        subject_filter = or_(
            func.lower(Conversation.subject) == cleaned_subject.lower(),
            Conversation.subject.is_(None),
        )
        material_filter = or_(
            func.lower(Material.subject) == cleaned_subject.lower(),
            Material.subject.is_(None),
        )
        profile_filter = or_(
            func.lower(ProjectProfile.subject) == cleaned_subject.lower(),
            ProjectProfile.subject.is_(None),
        )
    else:
        subject_filter = func.lower(Conversation.subject) == cleaned_subject.lower()
        material_filter = func.lower(Material.subject) == cleaned_subject.lower()
        profile_filter = func.lower(ProjectProfile.subject) == cleaned_subject.lower()

    profile_result = await session.execute(
        select(ProjectProfile).where(
            ProjectProfile.user_id == user_id,
            profile_filter,
        )
    )
    profiles = list(profile_result.scalars())

    conv_result = await session.execute(
        select(Conversation.id).where(Conversation.user_id == user_id, subject_filter)
    )
    conversation_ids = list(conv_result.scalars())

    material_result = await session.execute(
        select(Material.id, Material.storage_path).where(
            Material.user_id == user_id,
            material_filter,
        )
    )
    material_rows = list(material_result.all())
    material_ids = [row.id for row in material_rows]
    material_keys = [row.storage_path for row in material_rows if row.storage_path]
    cover_keys = [profile.cover_image_storage_key for profile in profiles if profile.cover_image_storage_key]

    if not profiles and not conversation_ids and not material_ids:
        raise HTTPException(status_code=404, detail="Subject not found.")

    if conversation_ids:
        feedback_result = await session.execute(
            select(MessageFeedback.id).where(
                MessageFeedback.user_id == user_id,
                MessageFeedback.conversation_id.in_(conversation_ids),
            )
        )
        feedback_ids = list(feedback_result.scalars())
        quiz_result = await session.execute(
            select(Quiz.id).where(Quiz.conversation_id.in_(conversation_ids))
        )
        quiz_ids = list(quiz_result.scalars())

        if feedback_ids:
            await session.execute(
                delete(PreferenceMemory).where(PreferenceMemory.source_feedback_id.in_(feedback_ids))
            )
        await session.execute(
            delete(MessageFeedback).where(
                MessageFeedback.user_id == user_id,
                MessageFeedback.conversation_id.in_(conversation_ids),
            )
        )
        await session.execute(delete(KeyIdea).where(KeyIdea.conversation_id.in_(conversation_ids)))
        if quiz_ids:
            await session.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id.in_(quiz_ids)))
        await session.execute(delete(Quiz).where(Quiz.conversation_id.in_(conversation_ids)))
        await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        await session.execute(delete(Conversation).where(Conversation.id.in_(conversation_ids)))

    if deleting_general:
        key_idea_subject_filter = or_(
            func.lower(KeyIdea.subject) == cleaned_subject.lower(),
            KeyIdea.subject.is_(None),
        )
        resource_subject_filter = or_(
            func.lower(Resource.subject) == cleaned_subject.lower(),
            Resource.subject == "",
        )
    else:
        key_idea_subject_filter = func.lower(KeyIdea.subject) == cleaned_subject.lower()
        resource_subject_filter = func.lower(Resource.subject) == cleaned_subject.lower()

    await session.execute(
        delete(KeyIdea).where(
            KeyIdea.user_id == user_id,
            key_idea_subject_filter,
        )
    )
    await session.execute(
        delete(Resource).where(
            Resource.user_id == user_id,
            resource_subject_filter,
        )
    )

    if material_ids:
        await session.execute(delete(MaterialChunk).where(MaterialChunk.material_id.in_(material_ids)))
        await session.execute(delete(Material).where(Material.id.in_(material_ids)))

    for profile in profiles:
        await session.delete(profile)

    await session.commit()

    for key in [*material_keys, *cover_keys]:
        try:
            await s3_client.delete_object(key=key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete object for subject %s: %s", cleaned_subject, key)


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

    incoming_key = body.cover_image_storage_key
    if incoming_key is not None and not incoming_key.startswith(f"cover-images/{user_id}/"):
        raise HTTPException(status_code=400, detail="Invalid cover image upload reference.")

    previous_key = profile.cover_image_storage_key
    if incoming_key:
        # User picked an uploaded image: ignore any URL payload.
        profile.cover_image_storage_key = incoming_key
        profile.cover_image_url = None
        profile.cover_image_source = "upload"
        profile.cover_image_source_url = None
        profile.cover_image_photographer = None
        profile.cover_image_photographer_url = None
    else:
        profile.cover_image_storage_key = None
        profile.cover_image_url = (
            str(body.cover_image_url) if body.cover_image_url is not None else None
        )
        profile.cover_image_source = body.cover_image_source
        profile.cover_image_source_url = (
            str(body.cover_image_source_url) if body.cover_image_source_url is not None else None
        )
        profile.cover_image_photographer = body.cover_image_photographer
        profile.cover_image_photographer_url = (
            str(body.cover_image_photographer_url)
            if body.cover_image_photographer_url is not None
            else None
        )

    try:
        await session.commit()
    except StaleDataError:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await session.refresh(profile)

    if previous_key and previous_key != profile.cover_image_storage_key:
        try:
            await s3_client.delete_object(key=previous_key)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to delete prior cover image %s", previous_key)

    return await _hydrate_profile_cover_url(profile)


class UpdateGoalsRequest(BaseModel):
    goals: str | None = None


@router.patch("/{subject}/goals", response_model=ProjectProfileRead)
async def update_project_goals(
    subject: str,
    body: UpdateGoalsRequest,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)
    profile.goals = body.goals.strip() if body.goals and body.goals.strip() else None
    try:
        await session.commit()
    except StaleDataError:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await session.refresh(profile)
    return await _hydrate_profile_cover_url(profile)


@router.post(
    "/{subject}/weak-quiz",
    response_model=WeakQuizResponse,
    dependencies=[_summary_rate_limit],
)
async def generate_weak_quiz(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> WeakQuizResponse:
    conv_result = await session.execute(
        select(Conversation).where(Conversation.user_id == user_id, Conversation.subject == subject)
    )
    conversations = list(conv_result.scalars())
    conv_ids = [c.id for c in conversations]

    weak_areas: set[str] = set()
    for c in conversations:
        if c.summary:
            weak_areas.update(c.summary.get("struggled_with", []))

    failed_questions: list[str] = []
    if conv_ids:
        failed_result = await session.execute(
            select(Quiz.question)
            .join(QuizAttempt, QuizAttempt.quiz_id == Quiz.id)
            .where(
                Quiz.conversation_id.in_(conv_ids),
                QuizAttempt.user_id == user_id,
                QuizAttempt.is_correct == False,  # noqa: E712
            )
            .distinct()
            .limit(10)
        )
        failed_questions = list(failed_result.scalars())

    if not weak_areas and not failed_questions:
        raise HTTPException(
            status_code=422,
            detail="No weak areas detected yet. Complete some sessions and generate summaries first.",
        )

    llm = create_llm_service()

    weak_list = "\n".join(f"- {w}" for w in sorted(weak_areas)) if weak_areas else "None identified yet"
    failed_section = (
        "\n\nThey also got these questions wrong previously:\n"
        + "\n".join(f"- {q}" for q in failed_questions)
        if failed_questions
        else ""
    )

    prompt = (
        f'Generate 5 quiz questions for a student studying "{subject}" '
        f"who has struggled with:\n{weak_list}{failed_section}\n\n"
        "Return ONLY a valid JSON array, no markdown fences, no explanation.\n"
        "Each item must follow one of these exact shapes:\n"
        '{"question":"...","concept":"...","quiz_type":"multiple_choice","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}\n'
        '{"question":"...","concept":"...","quiz_type":"short_answer","options":null,"correct_answer":"...","explanation":"..."}\n'
        "Rules: correct_answer for multiple_choice must be the exact text of one option. "
        "Include 3-4 multiple_choice and 1-2 short_answer. Target the weak areas specifically."
    )

    raw = await llm.generate_text(input_messages=[
        {"role": "system", "content": "You are a quiz generator. Output only valid JSON arrays, nothing else."},
        {"role": "user", "content": prompt},
    ])

    try:
        quiz_data_list = _extract_json_array(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Weak quiz JSON parse failed, raw: %s", raw[:200])
        raise HTTPException(status_code=502, detail="Failed to generate quiz questions. Please try again.")

    practice_conv = Conversation(user_id=user_id, subject=subject)
    session.add(practice_conv)
    await session.flush()

    quizzes: list[Quiz] = []
    for item in quiz_data_list[:5]:
        try:
            quiz = Quiz(
                conversation_id=practice_conv.id,
                question=str(item["question"]),
                concept=str(item.get("concept", "")).strip() or None,
                quiz_type=str(item.get("quiz_type", "short_answer")),
                options=item.get("options"),
                correct_answer=str(item["correct_answer"]),
                explanation=str(item.get("explanation", "")),
            )
            session.add(quiz)
            quizzes.append(quiz)
        except (KeyError, TypeError):
            continue

    if not quizzes:
        raise HTTPException(status_code=502, detail="Failed to generate valid quiz questions. Please try again.")

    await session.commit()
    for q in quizzes:
        await session.refresh(q)

    return WeakQuizResponse(
        conversation_id=practice_conv.id,
        quizzes=[QuizRead.model_validate(q) for q in quizzes],
    )


class GenerateQuizRequest(BaseModel):
    count: int = Field(default=5, ge=1, le=10)
    focus: str | None = Field(default=None, max_length=500)


@router.post(
    "/{subject}/quizzes/generate",
    response_model=WeakQuizResponse,
    dependencies=[_summary_rate_limit],
)
async def generate_subject_quiz(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    body: GenerateQuizRequest = GenerateQuizRequest(),
) -> WeakQuizResponse:
    profile = await _get_or_create_profile(session, user_id, subject)
    notes_result = await session.execute(
        select(KeyIdea.concept, KeyIdea.summary)
        .where(KeyIdea.user_id == user_id, KeyIdea.subject == subject)
        .order_by(KeyIdea.created_at.desc())
        .limit(10)
    )
    notes = list(notes_result.all())

    level_str = f" at {profile.level} level" if profile.level else ""
    goals_str = f" The student's stated goals: {profile.goals}." if profile.goals else ""
    focus_str = f" Focus the questions on: {body.focus.strip()}." if body.focus and body.focus.strip() else ""
    notes_block = (
        "\n\nRecent key concepts the student has been working on:\n"
        + "\n".join(f"- {concept}: {summary}" for concept, summary in notes[:8])
        if notes
        else ""
    )

    prompt = (
        f'Generate {body.count} quiz questions for a student studying "{subject}"{level_str}.{goals_str}{focus_str}'
        f"{notes_block}\n\n"
        "Return ONLY a valid JSON array, no markdown fences, no explanation.\n"
        "Each item must follow one of these exact shapes:\n"
        '{"question":"...","concept":"...","quiz_type":"multiple_choice","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}\n'
        '{"question":"...","concept":"...","quiz_type":"short_answer","options":null,"correct_answer":"...","explanation":"..."}\n'
        "Rules: correct_answer for multiple_choice must match one option exactly. "
        "Mix multiple_choice and short_answer. Vary difficulty. Cover the subject broadly when no focus is given."
    )

    llm = create_llm_service()
    raw = await llm.generate_text(input_messages=[
        {"role": "system", "content": "You are a quiz generator. Output only valid JSON arrays, nothing else."},
        {"role": "user", "content": prompt},
    ])

    try:
        quiz_data_list = _extract_json_array(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Subject quiz JSON parse failed: %s", raw[:200])
        raise HTTPException(status_code=502, detail="Failed to generate quiz questions. Please try again.")

    practice_conv = Conversation(user_id=user_id, subject=subject)
    session.add(practice_conv)
    await session.flush()

    quizzes: list[Quiz] = []
    for item in quiz_data_list[: body.count]:
        try:
            quiz = Quiz(
                conversation_id=practice_conv.id,
                question=str(item["question"]),
                concept=str(item.get("concept", "")).strip() or None,
                quiz_type=str(item.get("quiz_type", "short_answer")),
                options=item.get("options"),
                correct_answer=str(item["correct_answer"]),
                explanation=str(item.get("explanation", "")),
            )
            session.add(quiz)
            quizzes.append(quiz)
        except (KeyError, TypeError):
            continue

    if not quizzes:
        raise HTTPException(status_code=502, detail="Failed to generate valid quiz questions. Please try again.")

    await session.commit()
    for q in quizzes:
        await session.refresh(q)

    return WeakQuizResponse(
        conversation_id=practice_conv.id,
        quizzes=[QuizRead.model_validate(q) for q in quizzes],
    )


class GenerateFlashcardsRequest(BaseModel):
    count: int = Field(default=8, ge=1, le=20)
    focus: str | None = Field(default=None, max_length=500)


class GeneratedFlashcardsResponse(BaseModel):
    created: int


@router.post(
    "/{subject}/flashcards/generate",
    response_model=GeneratedFlashcardsResponse,
    dependencies=[_summary_rate_limit],
)
async def generate_subject_flashcards(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
    body: GenerateFlashcardsRequest = GenerateFlashcardsRequest(),
) -> GeneratedFlashcardsResponse:
    profile = await _get_or_create_profile(session, user_id, subject)
    existing_result = await session.execute(
        select(KeyIdea.concept)
        .where(KeyIdea.user_id == user_id, KeyIdea.subject == subject)
        .order_by(KeyIdea.created_at.desc())
        .limit(40)
    )
    existing_concepts = {row[0].strip().lower() for row in existing_result.all() if row[0]}

    level_str = f" at {profile.level} level" if profile.level else ""
    focus_str = f" Focus on: {body.focus.strip()}." if body.focus and body.focus.strip() else ""
    existing_block = (
        "\n\nDo NOT repeat any of these concepts the student already has notes on:\n"
        + "\n".join(f"- {c}" for c in list(existing_concepts)[:30])
        if existing_concepts
        else ""
    )
    prompt = (
        f'Generate {body.count} flashcards for a student studying "{subject}"{level_str}.{focus_str}'
        f"{existing_block}\n\n"
        "Return ONLY a valid JSON array, no markdown fences, no explanation.\n"
        'Each item: {"concept":"front of card","summary":"back of card"}\n'
        "The concept/front MUST be only one of: a short term, a concept name, a fill-in-the-blank prompt, or a question.\n"
        "The concept/front MUST NOT include the answer, a definition, a colon followed by explanation, or a summary sentence.\n"
        "Good fronts: \"SQL\", \"Primary Key\", \"What does SELECT do?\", \"A table row is also called a ____.\"\n"
        "Bad fronts: \"SQL: a language used to manage databases\", \"Primary Key: uniquely identifies a row\".\n"
        "Keep term/concept fronts under 8 words and question/fill-in-the-blank fronts under 18 words.\n"
        "The summary/back should contain the 1-2 sentence answer or definition the student should remember.\n"
        "Concepts should be diverse — cover different aspects of the subject."
    )

    llm = create_llm_service()
    raw = await llm.generate_text(input_messages=[
        {"role": "system", "content": "You are a flashcard generator. Output only valid JSON arrays, nothing else."},
        {"role": "user", "content": prompt},
    ])

    try:
        card_data = _extract_json_array(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Flashcard JSON parse failed: %s", raw[:200])
        raise HTTPException(status_code=502, detail="Failed to generate flashcards. Please try again.")

    practice_conv = Conversation(user_id=user_id, subject=subject)
    session.add(practice_conv)
    await session.flush()

    created = 0
    for item in card_data[: body.count]:
        try:
            concept = _clean_flashcard_front(item["concept"])
            summary = str(item["summary"]).strip()[:10000]
            if not concept or not summary:
                continue
            if not _is_valid_flashcard_front(concept):
                continue
            if concept.lower() in existing_concepts:
                continue
            idea = KeyIdea(
                user_id=user_id,
                conversation_id=practice_conv.id,
                subject=subject,
                concept=concept,
                summary=summary,
            )
            session.add(idea)
            created += 1
            existing_concepts.add(concept.lower())
        except (KeyError, TypeError):
            continue

    if created == 0:
        raise HTTPException(status_code=502, detail="No new flashcards could be created. Try a different focus.")

    await session.commit()
    return GeneratedFlashcardsResponse(created=created)


class SmartFlashcardRead(BaseModel):
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
    def from_orm(cls, obj: KeyIdea) -> "SmartFlashcardRead":
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


class SmartFlashcardSessionResponse(BaseModel):
    cards: list[SmartFlashcardRead]
    total_due: int
    weak_areas: list[str]
    generated: int


@router.get("/{subject}/flashcards/smart", response_model=SmartFlashcardSessionResponse)
async def get_smart_flashcard_session(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> SmartFlashcardSessionResponse:
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    # 1. Due SR cards for this subject
    due_result = await session.execute(
        select(KeyIdea)
        .where(
            KeyIdea.user_id == user_id,
            func.lower(KeyIdea.subject) == subject.strip().lower(),
            KeyIdea.sr_due_date <= now,
        )
        .order_by(KeyIdea.sr_due_date.asc())
        .limit(15)
    )
    due_cards = list(due_result.scalars())

    # 2. Gather analysis signals
    conv_result = await session.execute(
        select(Conversation).where(
            Conversation.user_id == user_id,
            Conversation.subject == subject,
        )
    )
    conversations = list(conv_result.scalars())
    conv_ids = [c.id for c in conversations]

    weak_areas: set[str] = set()
    for c in conversations:
        if c.summary:
            weak_areas.update(c.summary.get("struggled_with", []))

    # BKT low-mastery topics
    profile = await _get_or_create_profile(session, user_id, subject)
    if profile.knowledge_state:
        for state in profile.knowledge_state.values():
            mastery = float(state.get("mastery", 0.5))
            topic = state.get("topic") or ""
            if topic and mastery < 0.6:
                weak_areas.add(topic)

    # Failed quiz questions
    failed_concepts: list[str] = []
    if conv_ids:
        failed_result = await session.execute(
            select(Quiz.concept)
            .join(QuizAttempt, QuizAttempt.quiz_id == Quiz.id)
            .where(
                Quiz.conversation_id.in_(conv_ids),
                QuizAttempt.user_id == user_id,
                QuizAttempt.is_correct == False,  # noqa: E712
            )
            .where(Quiz.concept.isnot(None))
            .distinct()
            .limit(10)
        )
        failed_concepts = [r for r in failed_result.scalars() if r]
        weak_areas.update(failed_concepts)

    # 3. Generate targeted cards for weak areas not already covered
    existing_result = await session.execute(
        select(KeyIdea.concept).where(
            KeyIdea.user_id == user_id,
            func.lower(KeyIdea.subject) == subject.strip().lower(),
        )
    )
    existing_concepts = {r.strip().lower() for r in existing_result.scalars() if r}

    generated_cards: list[KeyIdea] = []
    target_count = max(0, 8 - len(due_cards))

    if target_count > 0:
        weak_list = sorted(weak_areas)
        if weak_list:
            focus_block = "Focus specifically on these weak areas:\n" + "\n".join(f"- {w}" for w in weak_list[:12])
        else:
            focus_block = f"Cover foundational concepts across {subject}."

        existing_block = (
            "\n\nDo NOT repeat any concept the student already has a card for:\n"
            + "\n".join(f"- {c}" for c in list(existing_concepts)[:30])
            if existing_concepts
            else ""
        )

        prompt = (
            f'Generate {target_count} flashcards for a student studying "{subject}". '
            f"{focus_block}{existing_block}\n\n"
            "Return ONLY a valid JSON array, no markdown fences, no explanation.\n"
            'Each item: {"concept":"front of card","summary":"back of card"}\n'
            "The concept/front MUST be only a specific term, concept name, fill-in-the-blank prompt, or question.\n"
            "The concept/front MUST NOT include the answer, a definition, a colon followed by explanation, or a summary sentence.\n"
            "Good fronts: \"SQL\", \"Primary Key\", \"What does SELECT do?\", \"A table row is also called a ____.\"\n"
            "Bad fronts: \"SQL: a language used to manage databases\", \"Primary Key: uniquely identifies a row\".\n"
            "Keep term/concept fronts under 8 words and question/fill-in-the-blank fronts under 18 words.\n"
            "The summary/back must be a 1-2 sentence standalone factual answer or definition.\n"
            "Summaries must be encyclopedic — no filler words, no chat phrases, no diagram references."
        )

        try:
            llm = create_llm_service(temperature=0)
            raw = await llm.generate_text(input_messages=[
                {"role": "system", "content": "You are a flashcard generator. Output only valid JSON arrays, nothing else."},
                {"role": "user", "content": prompt},
            ])
            card_data = _extract_json_array(raw)
            practice_conv = Conversation(user_id=user_id, subject=subject)
            session.add(practice_conv)
            await session.flush()
            for item in card_data[:target_count]:
                concept = _clean_flashcard_front(item.get("concept", ""))
                summary = str(item.get("summary", "")).strip()[:500]
                if not concept or not summary:
                    continue
                if not _is_valid_flashcard_front(concept):
                    continue
                if concept.lower() in existing_concepts:
                    continue
                idea = KeyIdea(
                    user_id=user_id,
                    conversation_id=practice_conv.id,
                    subject=subject,
                    concept=concept,
                    summary=summary,
                )
                session.add(idea)
                generated_cards.append(idea)
                existing_concepts.add(concept.lower())
            await session.commit()
            for card in generated_cards:
                await session.refresh(card)
        except Exception:
            logger.warning("Smart flashcard generation failed", exc_info=True)

    all_cards = due_cards + generated_cards
    return SmartFlashcardSessionResponse(
        cards=[SmartFlashcardRead.from_orm(c) for c in all_cards],
        total_due=len(due_cards),
        weak_areas=sorted(weak_areas),
        generated=len(generated_cards),
    )


@router.post(
    "/{subject}/mindmap",
    response_model=ProjectProfileRead,
    dependencies=[_summary_rate_limit],
)
async def generate_mindmap(
    subject: str,
    user_id: Annotated[int, Depends(get_user_id)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> ProjectProfileRead:
    profile = await _get_or_create_profile(session, user_id, subject)

    # temperature=0 gives deterministic, structured output and is measurably faster
    # for JSON-only responses on Gemini and GPT.
    llm = create_llm_service(temperature=0)

    level_str = f" at {profile.level} level" if profile.level else ""
    goals_str = f" Goals: {profile.goals}." if profile.goals else ""

    prompt = (
        f'Generate a concise learning map for "{subject}"{level_str}.{goals_str} '
        f"Output ONLY a valid JSON object — no markdown, no explanation, nothing else.\n"
        f"Schema (follow exactly):\n"
        f'{{"subject":"{subject}","nodes":['
        f'{{"id":"t1","topic":"Topic Name","subtopics":["Sub A","Sub B"],"prerequisite_ids":[],"order":0}}'
        f"]}}\n"
        f"Rules:\n"
        f"- 4-5 topics, 2-4 subtopics each (keep output small and fast).\n"
        f"- id must be a short slug like 't1','t2',...\n"
        f"- prerequisite_ids lists ids of topics that must come before this one (first topic has []).\n"
        f"- order is 0-indexed integer.\n"
        f"- No extra fields."
    )

    raw = await llm.generate_text(input_messages=[
        {"role": "system", "content": "You are a curriculum expert. Output only valid JSON, nothing else."},
        {"role": "user", "content": prompt},
    ])

    try:
        mind_map: dict[str, Any] = _extract_json_object(raw)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Mind map JSON parse failed, raw: %s", raw[:200])
        raise HTTPException(status_code=502, detail="Failed to generate mind map. Try again.")

    profile.mind_map = mind_map
    try:
        await session.commit()
    except StaleDataError:
        raise HTTPException(status_code=404, detail="Subject not found.")
    await session.refresh(profile)
    return await _hydrate_profile_cover_url(profile)
