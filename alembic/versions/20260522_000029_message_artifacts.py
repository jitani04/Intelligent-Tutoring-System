"""Add persisted message artifacts

Revision ID: 20260522_000029
Revises: 20260521_000028
Create Date: 2026-05-22 00:00:29.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260522_000029"
down_revision: Union[str, None] = "20260521_000028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("artifacts", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "artifacts")
