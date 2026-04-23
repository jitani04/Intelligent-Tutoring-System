"""Add password_hash to users

Revision ID: 20260422_000003
Revises: 20260420_000002
Create Date: 2026-04-22 00:00:03.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260422_000003"
down_revision: Union[str, None] = "20260420_000002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "password_hash")
