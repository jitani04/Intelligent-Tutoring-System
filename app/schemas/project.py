from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ProjectSetupRequest(BaseModel):
    subject: str
    level: str | None = None
    goals: str | None = None


class ProjectProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    level: str | None = None
    goals: str | None = None
    mind_map: dict[str, Any] | None = None
    created_at: datetime
