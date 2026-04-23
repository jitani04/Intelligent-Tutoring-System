"""add quiz and quiz_attempts tables

Revision ID: 20260422_000006
Revises: 20260422_000005
Create Date: 2026-04-22

"""
import sqlalchemy as sa
from alembic import op

revision = "20260422_000006"
down_revision = "20260422_000005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "quizzes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("quiz_type", sa.String(50), nullable=False),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("correct_answer", sa.Text(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "quiz_attempts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("quiz_id", sa.Integer(), sa.ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("answer", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False),
        sa.Column("attempted_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("quiz_attempts")
    op.drop_table("quizzes")
