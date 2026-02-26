from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class MessageRoleSchema(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    role: MessageRoleSchema
    content: str
    created_at: datetime
