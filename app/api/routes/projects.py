import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_user
from app.db.session import get_db_session
from app.models.conversation import Conversation
from app.models.project_profile import ProjectProfile
from app.models.quiz import Quiz, QuizAttempt
from app.schemas.project import ProjectCoverImageOption, ProjectProfileRead, ProjectProgressRead, ProjectSetupRequest
from app.schemas.quiz import QuizRead, WeakQuizResponse
from app.services.llm_service import LLMService
from app.services.stock_image_service import StockImageError, StockImageService

logger = logging.getLogger(__name__)
_project_settings = get_settings()
_summary_rate_limit = Depends(rate_limit_user("summary", _project_settings.rate_limit_summary_per_min))
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
    return [ProjectProfileRead.model_validate(profile) for profile in result.scalars()]


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
    )


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
    profile.cover_image_url = str(body.cover_image_url) if body.cover_image_url is not None else None
    profile.cover_image_source = body.cover_image_source
    profile.cover_image_source_url = str(body.cover_image_source_url) if body.cover_image_source_url is not None else None
    profile.cover_image_photographer = body.cover_image_photographer
    profile.cover_image_photographer_url = (
        str(body.cover_image_photographer_url) if body.cover_image_photographer_url is not None else None
    )
    await session.commit()
    await session.refresh(profile)
    return ProjectProfileRead.model_validate(profile)


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

    settings = get_settings()
    llm = LLMService(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
    )

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
        '{"question":"...","quiz_type":"multiple_choice","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."}\n'
        '{"question":"...","quiz_type":"short_answer","options":null,"correct_answer":"...","explanation":"..."}\n'
        "Rules: correct_answer for multiple_choice must be the exact text of one option. "
        "Include 3-4 multiple_choice and 1-2 short_answer. Target the weak areas specifically."
    )

    lc_messages = llm.to_langchain_messages([
        {"role": "system", "content": "You are a quiz generator. Output only valid JSON arrays, nothing else."},
        {"role": "user", "content": prompt},
    ])

    response = await llm._llm.ainvoke(lc_messages)
    raw = response.content if isinstance(response.content, str) else ""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    try:
        quiz_data_list = json.loads(raw)
        if not isinstance(quiz_data_list, list):
            raise ValueError("Expected a JSON array")
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
