from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, HttpUrl


class ProjectSetupRequest(BaseModel):
    subject: str
    level: str | None = None
    goals: str | None = None
    cover_image_url: HttpUrl | None = None
    cover_image_source: str | None = None
    cover_image_source_url: HttpUrl | None = None
    cover_image_photographer: str | None = None
    cover_image_photographer_url: HttpUrl | None = None


class ProjectProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: str
    level: str | None = None
    goals: str | None = None
    cover_image_url: str | None = None
    cover_image_source: str | None = None
    cover_image_source_url: str | None = None
    cover_image_photographer: str | None = None
    cover_image_photographer_url: str | None = None
    mind_map: dict[str, Any] | None = None
    created_at: datetime


class ProjectCoverImageOption(BaseModel):
    id: str
    image_url: str
    thumbnail_url: str
    photographer: str
    photographer_url: str
    source_url: str
    source: str


class ProjectProgressRead(BaseModel):
    total_sessions: int
    sessions_with_summary: int
    quizzes_attempted: int
    quizzes_passed: int
    pass_rate: float | None
    concepts_covered: list[str]
    weak_areas: list[str]
    next_review: list[str]
