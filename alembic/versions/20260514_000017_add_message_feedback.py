"""Add message feedback and preference memory

Revision ID: 20260514_000017
Revises: 20260513_000016
Create Date: 2026-05-14 00:00:17.000000

"""

from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa

revision: str = "20260514_000017"
down_revision: Union[str, None] = "20260513_000016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "message_feedback",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "message_id",
            sa.Integer(),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("rating", sa.String(length=16), nullable=False),
        sa.Column("feedback_text", sa.Text(), nullable=True),
        sa.Column("correction", sa.Text(), nullable=True),
        sa.Column("llm_reason_category", sa.String(length=64), nullable=True),
        sa.Column("llm_feedback_summary", sa.Text(), nullable=True),
        sa.Column("llm_derived_preference", sa.Text(), nullable=True),
        sa.Column("llm_should_update_user_preferences", sa.Boolean(), nullable=True),
        sa.Column("llm_stability", sa.String(length=16), nullable=True),
        sa.Column("llm_caveat", sa.Text(), nullable=True),
        sa.Column("task_type", sa.String(length=120), nullable=True),
        sa.Column("prompt_version", sa.String(length=120), nullable=True),
        sa.Column("model_name", sa.String(length=120), nullable=True),
        sa.Column("retrieved_chunk_ids", sa.JSON(), nullable=True),
        sa.Column("tool_trace", sa.JSON(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint("user_id", "message_id", name="uq_message_feedback_user_message"),
    )

    op.add_column("users", sa.Column("preference_summary", sa.Text(), nullable=True))
    op.add_column(
        "users",
        sa.Column("preference_summary_updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "preference_memories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "source_feedback_id",
            sa.Integer(),
            sa.ForeignKey("message_feedback.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("task_type", sa.String(length=120), nullable=True),
        sa.Column("rating", sa.String(length=16), nullable=False),
        sa.Column("llm_reason_category", sa.String(length=64), nullable=True),
        sa.Column("derived_preference", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=False),
        sa.Column("stability", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )

    # IVFFlat index on the cosine-distance opclass to keep
    # retrieve_preference_memories() sub-linear as the table grows. Tiny default
    # list count is fine for our scale; tune later if needed.
    op.execute(
        "CREATE INDEX ix_preference_memories_embedding "
        "ON preference_memories USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 50)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_preference_memories_embedding")
    op.drop_table("preference_memories")
    op.drop_column("users", "preference_summary_updated_at")
    op.drop_column("users", "preference_summary")
    op.drop_table("message_feedback")
