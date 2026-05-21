from __future__ import annotations

import logging
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.observability import (
    record_pending_agent_action_created,
    record_pending_agent_action_approved,
    record_pending_agent_action_rejected,
    record_review_digest_email_failed,
    record_review_digest_email_sent,
    record_review_digest_email_skipped,
    record_review_digest_generated,
)
from app.db.session import get_db_session
from app.models.agent_action import PendingAgentAction, ReviewDigestLog
from app.models.assignment import Assignment
from app.models.project_profile import ProjectProfile
from app.models.user import User
from app.services.email_service import create_email_provider
from app.services.review_digest_service import ReviewDigestService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["review-digests"])

DbDep = Annotated[AsyncSession, Depends(get_db_session)]
UserDep = Annotated[int, Depends(get_user_id)]


class ReviewDigestPreviewRequest(BaseModel):
    subject: str | None = None
    trigger_type: str = "manual"


class ReviewDigestSendRequest(BaseModel):
    pending_action_id: int


class PendingActionResponse(BaseModel):
    id: int
    action_type: str
    explanation: str
    status: str
    payload: dict[str, Any]
    preview: dict[str, Any] | None


class ReviewDigestSendResponse(BaseModel):
    status: str
    provider: str
    provider_message_id: str | None = None


def _action_response(action: PendingAgentAction) -> PendingActionResponse:
    return PendingActionResponse(
        id=action.id,
        action_type=action.action_type,
        explanation=action.explanation,
        status=action.status,
        payload=action.payload,
        preview=action.preview,
    )


@router.post("/review-digests/preview", response_model=PendingActionResponse)
async def preview_review_digest(
    body: ReviewDigestPreviewRequest,
    user_id: UserDep,
    session: DbDep,
) -> PendingActionResponse:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    digest = await ReviewDigestService().generate_digest(session=session, user=user, subject=body.subject, trigger_type=body.trigger_type)
    action = PendingAgentAction(
        user_id=user_id,
        subject=body.subject,
        action_type="send_review_digest_email",
        payload={"subject": body.subject, "trigger_type": body.trigger_type, "to": user.review_email_address or user.email},
        explanation=digest.reason,
        preview=digest.to_dict(),
        status="pending",
    )
    session.add(action)
    session.add(ReviewDigestLog(user_id=user_id, subject=body.subject, trigger_type=body.trigger_type, status="generated", metadata_={"focus_topics": digest.focus_topics}))
    await session.commit()
    await session.refresh(action)
    record_review_digest_generated()
    record_pending_agent_action_created(action.action_type)
    logger.info("review digest generated", extra={"user_id": user_id, "subject": body.subject, "trigger_type": body.trigger_type})
    return _action_response(action)


@router.post("/review-digests/send", response_model=ReviewDigestSendResponse)
async def send_review_digest(
    body: ReviewDigestSendRequest,
    user_id: UserDep,
    session: DbDep,
) -> ReviewDigestSendResponse:
    action = await session.get(PendingAgentAction, body.pending_action_id)
    if not action or action.user_id != user_id or action.action_type != "send_review_digest_email":
        raise HTTPException(status_code=404, detail="Pending action not found.")
    if action.status != "pending":
        raise HTTPException(status_code=409, detail="Pending action has already been handled.")
    if not action.preview:
        raise HTTPException(status_code=422, detail="Pending action has no digest preview.")
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return await _send_action_digest(session=session, action=action, user=user, trigger_type=str(action.payload.get("trigger_type") or "manual"))


@router.post("/pending-agent-actions/{action_id}/reject", response_model=PendingActionResponse)
async def reject_pending_agent_action(action_id: int, user_id: UserDep, session: DbDep) -> PendingActionResponse:
    action = await session.get(PendingAgentAction, action_id)
    if not action or action.user_id != user_id:
        raise HTTPException(status_code=404, detail="Pending action not found.")
    action.status = "rejected"
    await session.commit()
    await session.refresh(action)
    record_pending_agent_action_rejected(action.action_type)
    logger.info("pending agent action rejected", extra={"action_id": action.id, "action_type": action.action_type, "user_id": user_id})
    return _action_response(action)


@router.post("/internal/review-digests/run")
async def run_review_digest_cron(
    session: DbDep,
    x_internal_job_token: Annotated[str | None, Header(alias="X-Internal-Job-Token")] = None,
) -> dict[str, int]:
    settings = get_settings()
    if not settings.internal_job_token or x_internal_job_token != settings.internal_job_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal job token.")
    users = list((await session.execute(select(User).where(User.enable_review_emails.is_(True)))).scalars())
    sent = skipped = failed = 0
    for user in users:
        subjects = await _subjects_for_user(session=session, user_id=user.id)
        if not subjects:
            subjects = [None]
        for subject in subjects:
            digest = await ReviewDigestService().generate_digest(session=session, user=user, subject=subject, trigger_type="automatic")
            if not digest.focus_topics and not digest.upcoming_deadline:
                session.add(ReviewDigestLog(user_id=user.id, subject=subject, trigger_type="automatic", status="skipped", skipped_reason="no_review_signal"))
                record_review_digest_email_skipped("no_review_signal")
                skipped += 1
                continue
            action = PendingAgentAction(
                user_id=user.id,
                subject=subject,
                action_type="send_review_digest_email",
                payload={"subject": subject, "trigger_type": "automatic", "to": user.review_email_address or user.email},
                explanation=digest.reason,
                preview=digest.to_dict(),
                status="pending",
            )
            session.add(action)
            await session.commit()
            await session.refresh(action)
            record_review_digest_generated()
            record_pending_agent_action_created(action.action_type)
            try:
                await _send_action_digest(session=session, action=action, user=user, trigger_type="automatic")
                sent += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("automatic digest send failed", extra={"user_id": user.id, "subject": subject, "error": str(exc)})
                failed += 1
    await session.commit()
    return {"sent": sent, "skipped": skipped, "failed": failed}


async def _send_action_digest(*, session: AsyncSession, action: PendingAgentAction, user: User, trigger_type: str) -> ReviewDigestSendResponse:
    digest = action.preview or {}
    to = str(action.payload.get("to") or user.review_email_address or user.email)
    idempotency_key = f"review-digest-{action.id}-{uuid.uuid4().hex[:12]}"
    try:
        provider = create_email_provider()
        result = await provider.send_email(
            to=to,
            subject=str(digest.get("email_subject") or "Sapient Review Plan"),
            html_body=str(digest.get("html_body") or ""),
            text_body=str(digest.get("text_body") or ""),
            idempotency_key=idempotency_key,
        )
    except Exception:
        action.status = "failed"
        session.add(ReviewDigestLog(user_id=user.id, subject=action.subject, trigger_type=trigger_type, status="failed", metadata_={"action_id": action.id}, idempotency_key=idempotency_key))
        await session.commit()
        record_review_digest_email_failed()
        logger.exception("review digest email failed", extra={"action_id": action.id, "user_id": user.id})
        raise
    action.status = "approved"
    session.add(ReviewDigestLog(user_id=user.id, subject=action.subject, trigger_type=trigger_type, status="sent", metadata_={"action_id": action.id}, provider_message_id=result.message_id, idempotency_key=idempotency_key))
    await session.commit()
    record_pending_agent_action_approved(action.action_type)
    record_review_digest_email_sent()
    logger.info("review digest email sent", extra={"action_id": action.id, "user_id": user.id, "provider": result.provider})
    return ReviewDigestSendResponse(status=result.status, provider=result.provider, provider_message_id=result.message_id)


async def _subjects_for_user(*, session: AsyncSession, user_id: int) -> list[str]:
    profile_subjects = [s for s in (await session.execute(select(ProjectProfile.subject).where(ProjectProfile.user_id == user_id))).scalars() if s]
    assignment_subjects = [s for s in (await session.execute(select(Assignment.subject).where(Assignment.user_id == user_id, Assignment.subject.is_not(None)))).scalars() if s]
    seen: set[str] = set()
    subjects: list[str] = []
    for subject in [*profile_subjects, *assignment_subjects]:
        key = subject.lower()
        if key not in seen:
            seen.add(key)
            subjects.append(subject)
    return subjects[:20]
