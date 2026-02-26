from typing import Annotated

from fastapi import Header, HTTPException, status


async def get_user_id(x_user_id: Annotated[int | None, Header(alias="X-User-Id")] = None) -> int:
    if x_user_id is None or x_user_id <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid X-User-Id header is required.",
        )
    return x_user_id

