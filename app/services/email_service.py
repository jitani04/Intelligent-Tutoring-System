from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import Settings, get_settings


@dataclass(slots=True)
class EmailSendResult:
    provider: str
    message_id: str | None
    status: str


class EmailProvider(Protocol):
    async def send_email(self, *, to: str, subject: str, html_body: str, text_body: str, idempotency_key: str) -> EmailSendResult:
        ...


class NoopEmailProvider:
    async def send_email(self, *, to: str, subject: str, html_body: str, text_body: str, idempotency_key: str) -> EmailSendResult:
        return EmailSendResult(provider="noop", message_id=f"noop-{idempotency_key}", status="sent")


class ResendEmailProvider:
    def __init__(self, *, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()

    async def send_email(self, *, to: str, subject: str, html_body: str, text_body: str, idempotency_key: str) -> EmailSendResult:
        if not self.settings.resend_api_key:
            raise ValueError("RESEND_API_KEY is required when EMAIL_PROVIDER=resend.")
        if not self.settings.email_from_address:
            raise ValueError("EMAIL_FROM_ADDRESS is required when EMAIL_PROVIDER=resend.")

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.settings.resend_api_key}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotency_key,
                },
                json={
                    "from": self.settings.email_from_address,
                    "to": [to],
                    "subject": subject,
                    "html": html_body,
                    "text": text_body,
                    "tags": [{"name": "category", "value": "review_digest"}],
                },
            )
            response.raise_for_status()
            data = response.json()
        return EmailSendResult(provider="resend", message_id=data.get("id"), status="sent")


def create_email_provider(settings: Settings | None = None) -> EmailProvider:
    settings = settings or get_settings()
    provider = settings.email_provider.strip().lower()
    if provider in {"", "noop", "none"}:
        return NoopEmailProvider()
    if provider == "resend":
        return ResendEmailProvider(settings=settings)
    raise ValueError(f"Unsupported EMAIL_PROVIDER: {settings.email_provider!r}")
