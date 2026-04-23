"""drop topic column from conversations

Revision ID: 20260422_000005
Revises: 20260422_000004
Create Date: 2026-04-22

"""
from alembic import op
import sqlalchemy as sa

revision = "20260422_000005"
down_revision = "20260422_000004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("conversations", "topic")


def downgrade() -> None:
    op.add_column("conversations", sa.Column("topic", sa.String(255), nullable=True))
