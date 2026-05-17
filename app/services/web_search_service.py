import logging
from dataclasses import dataclass

import httpx

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class WebSearchResult:
    title: str
    url: str
    snippet: str
    summary: str | None = None
    display_url: str | None = None
    published_at: str | None = None
    crawled_at: str | None = None


class LangSearchWebSearch:
    """Web search provider used by the tutoring agent for outside/current info."""

    def __init__(
        self,
        *,
        api_key: str,
        endpoint: str,
        timeout_seconds: float,
        default_count: int,
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.default_count = max(1, min(default_count, 10))

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key.strip())

    async def search(
        self,
        *,
        query: str,
        count: int | None = None,
        freshness: str = "noLimit",
    ) -> list[WebSearchResult]:
        clean_query = query.strip()
        if not self.is_configured or not clean_query:
            return []

        safe_freshness = freshness if freshness in {"oneDay", "oneWeek", "oneMonth", "oneYear", "noLimit"} else "noLimit"
        payload = {
            "query": clean_query,
            "freshness": safe_freshness,
            "summary": True,
            "count": max(1, min(count or self.default_count, 10)),
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                response = await client.post(f"{self.endpoint}/v1/web-search", json=payload, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning("LangSearch web search request failed: %s", exc)
            return []

        data = response.json()
        if data.get("code") not in (None, 200):
            logger.warning("LangSearch web search returned code %s.", data.get("code"))
            return []

        raw_results = data.get("data", {}).get("webPages", {}).get("value", [])
        if not isinstance(raw_results, list):
            logger.warning("LangSearch web search response missing webPages.value.")
            return []

        parsed: list[WebSearchResult] = []
        for item in raw_results:
            if not isinstance(item, dict):
                continue
            title = str(item.get("name") or "").strip()
            url = str(item.get("url") or "").strip()
            snippet = str(item.get("snippet") or "").strip()
            if not title or not url:
                continue
            parsed.append(
                WebSearchResult(
                    title=title[:180],
                    url=url,
                    display_url=str(item.get("displayUrl") or "").strip() or None,
                    snippet=snippet[:1200],
                    summary=(str(item.get("summary") or "").strip()[:2500] or None),
                    published_at=str(item.get("datePublished") or "").strip() or None,
                    crawled_at=str(item.get("dateLastCrawled") or "").strip() or None,
                )
            )
        return parsed


def create_web_search_service() -> LangSearchWebSearch | None:
    settings = get_settings()
    if not settings.web_search_enabled:
        return None
    if not settings.langsearch_api_key.strip():
        logger.info("Web search is enabled but LANGSEARCH_API_KEY is not set; web_search tool disabled.")
        return None
    return LangSearchWebSearch(
        api_key=settings.langsearch_api_key,
        endpoint=settings.langsearch_api_base_url,
        timeout_seconds=settings.web_search_timeout_seconds,
        default_count=settings.web_search_result_count,
    )
