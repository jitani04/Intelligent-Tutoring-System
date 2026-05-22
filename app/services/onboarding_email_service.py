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


_BRAND_TEXT_COLOR = "#e2eaf4"

_LOGO_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
  <path d="M30 17c-2.7-3.2-8.5-2.2-10 1.9-4.7.3-8.4 4.2-8.4 9 0 1.9.6 3.7 1.6 5.2-2.1 4.6 1.2 9.9 6.2 10.2 1.7 3.7 6.8 4.7 10.6 2.2V17Z" fill="none" stroke="{_BRAND_TEXT_COLOR}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 17c2.7-3.2 8.5-2.2 10 1.9 4.7.3 8.4 4.2 8.4 9 0 1.9-.6 3.7-1.6 5.2 2.1 4.6-1.2 9.9-6.2 10.2-1.7 3.7-6.8 4.7-10.6 2.2V17Z" fill="none" stroke="{_BRAND_TEXT_COLOR}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M24 27h8m0 0h7m-7 0v9m0 0h8m-8 0h-6" fill="none" stroke="{_BRAND_TEXT_COLOR}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="24" cy="27" r="3.2" fill="{_BRAND_TEXT_COLOR}"/>
  <circle cx="39" cy="27" r="3.2" fill="{_BRAND_TEXT_COLOR}"/>
  <circle cx="40" cy="36" r="3.2" fill="{_BRAND_TEXT_COLOR}"/>
  <circle cx="26" cy="36" r="3.2" fill="{_BRAND_TEXT_COLOR}"/>
</svg>"""


def build_onboarding_email(*, user_id: int, email: str, name: str | None = None, settings: Settings | None = None) -> OnboardingEmail:
    settings = settings or get_settings()
    base_url = settings.app_base_url.rstrip("/")
    display_name = (name or "").strip() or "there"
    escaped_name = html.escape(display_name)
    escaped_url = html.escape(base_url)

    subject = f"Welcome to Sapient, {display_name}!"

    text_body = "\n".join([
        f"Hi {display_name},",
        "",
        "Welcome to Sapient — your study workspace is ready.",
        "",
        "Here's what to try first:",
        "  • Upload your notes or slides and ask Sapient to explain them",
        "  • Create a subject and let Sapient quiz you on what you're learning",
        "  • Check your review schedule to see what's due",
        "",
        f"Open Sapient: {base_url}",
        "",
        "You can manage notification preferences from Settings any time.",
        "",
        "— The Sapient team",
    ])

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f5f9;padding:40px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

      <!-- Header -->
      <tr><td style="background:#0f172a;border-radius:14px 14px 0 0;padding:36px 40px 28px;text-align:center;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;background:#1e293b;border-radius:50%;margin-bottom:16px;">
          {_LOGO_SVG}
        </div>
        <div style="color:{_BRAND_TEXT_COLOR};font-size:24px;font-weight:700;letter-spacing:-0.4px;line-height:1;">Sapient</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:6px;letter-spacing:0.3px;text-transform:uppercase;">Your AI study tutor</div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:40px 40px 36px;">

        <h1 style="margin:0 0 10px;font-size:26px;font-weight:700;color:#0f172a;line-height:1.2;">Welcome, {escaped_name}!</h1>
        <p style="margin:0 0 32px;color:#475569;font-size:16px;line-height:1.65;">Your study workspace is ready. Here&#8217;s what to try first:</p>

        <!-- Feature 1 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td width="48" valign="top" style="padding-right:16px;">
              <div style="width:40px;height:40px;background:#ede9fe;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">📄</div>
            </td>
            <td valign="middle">
              <div style="font-weight:600;color:#0f172a;font-size:15px;margin-bottom:3px;">Upload your materials</div>
              <div style="color:#64748b;font-size:13px;line-height:1.5;">Add notes, slides, or PDFs. Every answer Sapient gives will cite the exact page it came from.</div>
            </td>
          </tr>
        </table>

        <!-- Feature 2 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr>
            <td width="48" valign="top" style="padding-right:16px;">
              <div style="width:40px;height:40px;background:#dbeafe;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">🧠</div>
            </td>
            <td valign="middle">
              <div style="font-weight:600;color:#0f172a;font-size:15px;margin-bottom:3px;">Get quizzed on what you&#8217;re learning</div>
              <div style="color:#64748b;font-size:13px;line-height:1.5;">Sapient generates quizzes mid-chat and tracks your mastery over time so you always know what to review next.</div>
            </td>
          </tr>
        </table>

        <!-- Feature 3 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px;">
          <tr>
            <td width="48" valign="top" style="padding-right:16px;">
              <div style="width:40px;height:40px;background:#dcfce7;border-radius:10px;text-align:center;line-height:40px;font-size:20px;">📅</div>
            </td>
            <td valign="middle">
              <div style="font-weight:600;color:#0f172a;font-size:15px;margin-bottom:3px;">Review at the right time</div>
              <div style="color:#64748b;font-size:13px;line-height:1.5;">Notes and flashcards resurface automatically right before you&#8217;d forget them. Sync your Canvas calendar to get deadline-aware reminders.</div>
            </td>
          </tr>
        </table>

        <!-- CTA -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center">
            <a href="{escaped_url}" style="display:inline-block;background:#4f46e5;color:#ffffff;font-weight:600;font-size:15px;padding:15px 36px;border-radius:9px;text-decoration:none;letter-spacing:0.1px;">Open Sapient &#8594;</a>
          </td></tr>
        </table>

      </td></tr>

      <!-- Footer -->
      <tr><td style="padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
          You&#8217;re receiving this because you signed up for Sapient.<br>
          Manage notification preferences in <a href="{escaped_url}/settings" style="color:#6366f1;text-decoration:none;">Settings</a>.
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""

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
