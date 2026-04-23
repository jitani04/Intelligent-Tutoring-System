"""add subject and topic to conversations

Revision ID: 20260422_000004
Revises: 20260422_000003
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = "20260422_000004"
down_revision = "20260422_000003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("subject", sa.String(255), nullable=True))
    op.add_column("conversations", sa.Column("topic", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("conversations", "topic")
    op.drop_column("conversations", "subject")
