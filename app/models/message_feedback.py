from datetime import datetime

from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MessageFeedback(Base):
    __tablename__ = "message_feedback"
    __table_args__ = (
        UniqueConstraint("user_id", "message_id", name="uq_message_feedback_user_message"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), index=True, nullable=False
    )
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rating: Mapped[str] = mapped_column(String(16), nullable=False)
    feedback_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    correction: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_reason_category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    llm_feedback_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_derived_preference: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_should_update_user_preferences: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    llm_stability: Mapped[str | None] = mapped_column(String(16), nullable=True)
    llm_caveat: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(120), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    retrieved_chunk_ids: Mapped[list[int] | None] = mapped_column(JSON, nullable=True)
    tool_trace: Mapped[dict[str, Any] | list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
