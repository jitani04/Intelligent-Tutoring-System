import httpx


class StockImageError(Exception):
    pass


class StockImageService:
    def __init__(self, *, pexels_api_key: str) -> None:
        self._pexels_api_key = pexels_api_key
        self._base_url = "https://api.pexels.com/v1"

    async def search_photos(self, query: str, per_page: int = 8) -> list[dict[str, str]]:
        if not self._pexels_api_key:
            raise StockImageError("PEXELS_API_KEY is not configured.")

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{self._base_url}/search",
                params={
                    "query": query,
                    "per_page": per_page,
                    "orientation": "landscape",
                    "size": "medium",
                },
                headers={"Authorization": self._pexels_api_key},
            )

        if response.status_code >= 400:
            raise StockImageError(f"Pexels search failed with {response.status_code}.")

        payload = response.json()
        results: list[dict[str, str]] = []
        for photo in payload.get("photos", []):
            src = photo.get("src") or {}
            image_url = src.get("landscape") or src.get("large") or src.get("original")
            thumbnail_url = src.get("medium") or src.get("small") or image_url
            source_url = photo.get("url")
            photographer = photo.get("photographer")
            photographer_url = photo.get("photographer_url")

            if not all([image_url, thumbnail_url, source_url, photographer, photographer_url]):
                continue

            results.append(
                {
                    "id": str(photo.get("id")),
                    "image_url": image_url,
                    "thumbnail_url": thumbnail_url,
                    "photographer": photographer,
                    "photographer_url": photographer_url,
                    "source_url": source_url,
                    "source": "Pexels",
                }
            )

        return results
