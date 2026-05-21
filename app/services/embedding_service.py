import asyncio
import logging

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_RETRYABLE_STATUS = {429, 500, 502, 503, 504}
_MAX_RETRIES = 3
_RETRY_BACKOFF = [1.0, 2.0, 4.0]


class EmbeddingService:
    def __init__(self, *, api_key: str, model: str, dimensions: int) -> None:
        self._api_key = api_key
        # strip "models/" prefix — we reconstruct it in the URL
        self._model = model.removeprefix("models/")
        self._dimensions = dimensions
        self._base = "https://generativelanguage.googleapis.com/v1beta"

    async def _embed_one(self, client: httpx.AsyncClient, text: str) -> list[float]:
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await client.post(
                    f"{self._base}/models/{self._model}:embedContent",
                    headers={"x-goog-api-key": self._api_key},
                    json={
                        "model": f"models/{self._model}",
                        "content": {"parts": [{"text": text}]},
                        "outputDimensionality": self._dimensions,
                    },
                    timeout=30.0,
                )
                if resp.status_code in _RETRYABLE_STATUS and attempt < _MAX_RETRIES - 1:
                    logger.warning(
                        "Embedding API transient error, retrying",
                        extra={"status": resp.status_code, "attempt": attempt + 1, "model": self._model},
                    )
                    await asyncio.sleep(_RETRY_BACKOFF[attempt])
                    continue
                resp.raise_for_status()
                return resp.json()["embedding"]["values"]
            except httpx.TimeoutException as exc:
                last_exc = exc
                if attempt < _MAX_RETRIES - 1:
                    logger.warning("Embedding API timeout, retrying", extra={"attempt": attempt + 1})
                    await asyncio.sleep(_RETRY_BACKOFF[attempt])
        raise last_exc or RuntimeError("Embedding failed after retries")

    async def embed_query(self, text: str) -> list[float]:
        async with httpx.AsyncClient() as client:
            return await self._embed_one(client, text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient() as client:
            return list(await asyncio.gather(*[self._embed_one(client, t) for t in texts]))


def create_embedding_service() -> EmbeddingService:
    settings = get_settings()
    return EmbeddingService(
        api_key=settings.embedding_api_key or settings.llm_api_key,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
    )
