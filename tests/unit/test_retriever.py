import asyncio

from app.services.retriever import retrieve_context


def test_retriever_returns_empty_list() -> None:
    result = asyncio.run(retrieve_context("Any query"))
    assert result == []
