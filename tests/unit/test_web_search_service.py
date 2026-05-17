import json

import httpx
import pytest

from app.services.web_search_service import LangSearchWebSearch


@pytest.mark.asyncio
async def test_langsearch_web_search_parses_results(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["json"] = json.loads(request.content.decode())
        return httpx.Response(
            200,
            json={
                "code": 200,
                "data": {
                    "webPages": {
                        "value": [
                            {
                                "name": "Example Result",
                                "url": "https://example.com/result",
                                "displayUrl": "example.com/result",
                                "snippet": "Short snippet",
                                "summary": "Longer result summary",
                                "datePublished": "2026-05-01",
                                "dateLastCrawled": "2026-05-15",
                            }
                        ]
                    }
                },
            },
        )

    transport = httpx.MockTransport(handler)
    original_async_client = httpx.AsyncClient

    class MockAsyncClient:
        def __init__(self, *args: object, **kwargs: object) -> None:
            self.client = original_async_client(transport=transport)

        async def __aenter__(self) -> httpx.AsyncClient:
            return self.client

        async def __aexit__(self, *args: object) -> None:
            await self.client.aclose()

    monkeypatch.setattr(httpx, "AsyncClient", MockAsyncClient)

    search = LangSearchWebSearch(
        api_key="test-key",
        endpoint="https://api.langsearch.com",
        timeout_seconds=1,
        default_count=5,
    )

    results = await search.search(query="latest CSS grid support", count=3, freshness="oneMonth")

    assert captured["url"] == "https://api.langsearch.com/v1/web-search"
    assert captured["auth"] == "Bearer test-key"
    assert captured["json"] == {
        "query": "latest CSS grid support",
        "freshness": "oneMonth",
        "summary": True,
        "count": 3,
    }
    assert len(results) == 1
    assert results[0].title == "Example Result"
    assert results[0].url == "https://example.com/result"
    assert results[0].summary == "Longer result summary"


@pytest.mark.asyncio
async def test_langsearch_web_search_returns_empty_without_key() -> None:
    search = LangSearchWebSearch(
        api_key="",
        endpoint="https://api.langsearch.com",
        timeout_seconds=1,
        default_count=5,
    )

    assert await search.search(query="anything") == []
