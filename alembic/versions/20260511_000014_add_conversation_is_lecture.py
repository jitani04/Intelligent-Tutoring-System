"""Add is_lecture flag to conversations

Revision ID: 20260511_000014
Revises: 20260502_000013
Create Date: 2026-05-11 00:00:14.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260511_000014"
down_revision: Union[str, None] = "20260502_000013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("is_lecture", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("conversations", "is_lecture", server_default=None)


def downgrade() -> None:
    op.drop_column("conversations", "is_lecture")
