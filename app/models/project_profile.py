from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProjectProfile(Base):
    __tablename__ = "project_profiles"
    __table_args__ = (UniqueConstraint("user_id", "subject", name="uq_project_profile_user_subject"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    level: Mapped[str | None] = mapped_column(String(50), nullable=True)
    goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    mind_map: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
