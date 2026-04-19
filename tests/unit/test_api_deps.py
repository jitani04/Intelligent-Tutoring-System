import asyncio

import pytest
from fastapi import HTTPException

from app.api.deps import get_user_id


def test_get_user_id_accepts_positive_values() -> None:
    result = asyncio.run(get_user_id(7))
    assert result == 7


def test_get_user_id_rejects_missing_header() -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_user_id(None))

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "A valid X-User-Id header is required."


def test_get_user_id_rejects_non_positive_values() -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_user_id(0))

    assert exc_info.value.status_code == 400
