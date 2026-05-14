from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class PreferenceMemory(Base):
    __tablename__ = "preference_memories"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    source_feedback_id: Mapped[int] = mapped_column(
        ForeignKey("message_feedback.id", ondelete="CASCADE"), index=True, nullable=False
    )
    task_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rating: Mapped[str] = mapped_column(String(16), nullable=False)
    llm_reason_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    derived_preference: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(768), nullable=False)
    stability: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
