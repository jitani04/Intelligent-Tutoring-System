from __future__ import annotations

import html
import logging
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.services.email_service import EmailProvider, create_email_provider

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class OnboardingEmail:
    to: str
    subject: str
    text_body: str
    html_body: str
    idempotency_key: str


def build_onboarding_email(*, user_id: int, email: str, name: str | None = None, settings: Settings | None = None) -> OnboardingEmail:
    settings = settings or get_settings()
    base_url = settings.app_base_url.rstrip("/")
    display_name = (name or "").strip() or "there"
    subject = "Welcome to Sapient"
    text_body = "\n".join(
        [
            f"Hi {display_name},",
            "",
            "Welcome to Sapient. Your study workspace is ready.",
            "",
            "Start by creating a subject, uploading class materials, or asking Sapient to quiz you on what you are learning.",
            "",
            f"Open Sapient: {base_url}",
            "",
            "You can manage review email preferences from Settings after you sign in.",
        ]
    )
    escaped_name = html.escape(display_name)
    escaped_url = html.escape(base_url)
    html_body = "\n".join(
        [
            "<h1>Welcome to Sapient</h1>",
            f"<p>Hi {escaped_name},</p>",
            "<p>Your study workspace is ready.</p>",
            "<p>Start by creating a subject, uploading class materials, or asking Sapient to quiz you on what you are learning.</p>",
            f'<p><a href="{escaped_url}">Open Sapient</a></p>',
            '<p style="color:#64748b;font-size:13px">You can manage review email preferences from Settings after you sign in.</p>',
        ]
    )
    return OnboardingEmail(
        to=email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
        idempotency_key=f"onboarding-user-{user_id}",
    )


async def send_onboarding_email(
    *,
    user_id: int,
    email: str,
    name: str | None = None,
    provider: EmailProvider | None = None,
    settings: Settings | None = None,
) -> None:
    message = build_onboarding_email(user_id=user_id, email=email, name=name, settings=settings)
    provider = provider or create_email_provider(settings)
    try:
        result = await provider.send_email(
            to=message.to,
            subject=message.subject,
            html_body=message.html_body,
            text_body=message.text_body,
            idempotency_key=message.idempotency_key,
        )
    except Exception:
        logger.exception("onboarding email failed", extra={"user_id": user_id})
        return
    logger.info(
        "onboarding email sent",
        extra={"user_id": user_id, "provider": result.provider, "provider_message_id": result.message_id},
    )
