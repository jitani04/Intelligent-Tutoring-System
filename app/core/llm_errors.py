"""Shared helpers for detecting LLM quota / rate-limit errors and parsing retry hints."""
from __future__ import annotations

import re

_QUOTA_MARKERS = (
    # Gemini
    "RESOURCE_EXHAUSTED",
    "ResourceExhausted",
    # OpenAI (Whisper STT, OpenAI TTS)
    "insufficient_quota",
    "rate_limit_exceeded",
    "RateLimitError",
    # Generic
    "quota",
    "rate limit",
    "rate-limited",
    "too many requests",
    "429",
)


def is_llm_quota_error(exc: BaseException) -> bool:
    """True if `exc` looks like an upstream LLM/embedding/audio rate-limit or quota error."""
    msg = str(exc)
    return any(m.lower() in msg.lower() for m in _QUOTA_MARKERS)


def retry_after_from_message(msg: str) -> int:
    """Best-effort extraction of seconds-until-retry from a provider error string.

    Returns 60 by default if no explicit hint can be parsed.
    """
    match = re.search(r"retry in ([\d.]+)\s*s", msg, flags=re.IGNORECASE) or re.search(
        r"retryDelay['\"]?:\s*['\"]?(\d+)", msg
    )
    if match:
        try:
            return max(1, int(float(match.group(1))) + 1)
        except (TypeError, ValueError):
            pass
    return 60
