import asyncio

import httpx

from app.core.config import get_settings


class EmbeddingService:
    def __init__(self, *, api_key: str, model: str, dimensions: int) -> None:
        self._api_key = api_key
        # strip "models/" prefix — we reconstruct it in the URL
        self._model = model.removeprefix("models/")
        self._dimensions = dimensions
        self._base = "https://generativelanguage.googleapis.com/v1beta"

    async def _embed_one(self, client: httpx.AsyncClient, text: str) -> list[float]:
        resp = await client.post(
            f"{self._base}/models/{self._model}:embedContent",
            params={"key": self._api_key},
            json={
                "model": f"models/{self._model}",
                "content": {"parts": [{"text": text}]},
                "outputDimensionality": self._dimensions,
            },
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["embedding"]["values"]

    async def embed_query(self, text: str) -> list[float]:
        async with httpx.AsyncClient() as client:
            return await self._embed_one(client, text)

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        async with httpx.AsyncClient() as client:
            return list(await asyncio.gather(*[self._embed_one(client, t) for t in texts]))


def create_embedding_service() -> EmbeddingService:
    settings = get_settings()
    return EmbeddingService(
        api_key=settings.llm_api_key,
        model=settings.embedding_model,
        dimensions=settings.embedding_dimensions,
    )
