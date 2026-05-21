"""Add lecture_notes table for saved lecture notebook snapshots

Revision ID: 20260520_000027
Revises: 20260518_000026
Create Date: 2026-05-20 00:00:27.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260520_000027"
down_revision: Union[str, None] = "20260518_000026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lecture_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("subject", sa.String(length=255), nullable=True, index=True),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("timeline", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_lecture_notes_user_subject",
        "lecture_notes",
        ["user_id", "subject"],
    )


def downgrade() -> None:
    op.drop_index("ix_lecture_notes_user_subject", table_name="lecture_notes")
    op.drop_table("lecture_notes")
