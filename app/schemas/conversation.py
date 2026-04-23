from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.message import MessageRead


class ConversationCreate(BaseModel):
    subject: str | None = None


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    subject: str | None = None
    created_at: datetime
    messages: list[MessageRead] = Field(default_factory=list)
