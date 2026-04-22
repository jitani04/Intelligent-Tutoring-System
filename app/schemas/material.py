from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class MaterialStatusSchema(str, Enum):
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class MaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    filename: str
    mime_type: str
    subject: str | None
    status: MaterialStatusSchema
    error_message: str | None
    created_at: datetime
    processed_at: datetime | None
