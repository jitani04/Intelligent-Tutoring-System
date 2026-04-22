import asyncio

from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.core.config import get_settings


class EmbeddingService:
    def __init__(self, *, api_key: str, model: str, output_dimensionality: int) -> None:
        self._client = GoogleGenerativeAIEmbeddings(
            model=model,
            google_api_key=api_key,
            output_dimensionality=output_dimensionality,
        )

    async def embed_query(self, text: str) -> list[float]:
        return list(await asyncio.to_thread(self._client.embed_query, text))

    async def embed_documents(self, texts: list[str]) -> list[list[float]]:
        embeddings = await asyncio.to_thread(self._client.embed_documents, texts)
        return [list(embedding) for embedding in embeddings]


def create_embedding_service() -> EmbeddingService:
    settings = get_settings()
    return EmbeddingService(
        api_key=settings.llm_api_key,
        model=settings.embedding_model,
        output_dimensionality=settings.embedding_dimensions,
    )
