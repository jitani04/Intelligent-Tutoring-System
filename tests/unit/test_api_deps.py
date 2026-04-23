import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import get_user_id
from app.core.security import create_access_token


def _credentials(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


def test_get_user_id_accepts_valid_bearer_token() -> None:
    result = asyncio.run(get_user_id(_credentials(create_access_token(7))))
    assert result == 7


def test_get_user_id_rejects_missing_token() -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_user_id(None))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Missing bearer token."


def test_get_user_id_rejects_invalid_token() -> None:
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(get_user_id(_credentials("not-a-token")))

    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == "Invalid token."
