import pytest

from app.services.retriever import retrieve_context


@pytest.mark.asyncio
async def test_retriever_returns_empty_list() -> None:
    result = await retrieve_context("Any query")
    assert result == []
