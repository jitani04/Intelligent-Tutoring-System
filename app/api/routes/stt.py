import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.api.deps import get_user_id
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_user

logger = logging.getLogger(__name__)
_settings = get_settings()
router = APIRouter(
    tags=["stt"],
    dependencies=[Depends(rate_limit_user("stt", _settings.rate_limit_stt_per_min))],
)

_MAX_BYTES = 25 * 1024 * 1024  # 25 MB — OpenAI Whisper limit

_MIME_TO_EXT: dict[str, str] = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
}


def _ext_from_mime(mime: str) -> str:
    base = mime.split(";")[0].strip().lower()
    return _MIME_TO_EXT.get(base, "webm")


class STTResponse(BaseModel):
    text: str


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(
    audio: UploadFile,
    user_id: Annotated[int, Depends(get_user_id)],
) -> STTResponse:
    settings = get_settings()
    if not settings.openai_tts_api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice input is not configured on this server.",
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Audio file is empty.")
    if len(audio_bytes) > _MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Audio file too large.")

    mime = audio.content_type or "audio/webm"
    ext = _ext_from_mime(mime)
    filename = f"recording.{ext}"

    client = AsyncOpenAI(api_key=settings.openai_tts_api_key)
    try:
        transcript = await client.audio.transcriptions.create(
            model="whisper-1",
            file=(filename, audio_bytes, mime),
        )
    except Exception:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed. Please try again.")

    return STTResponse(text=transcript.text)
