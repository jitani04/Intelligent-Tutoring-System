"""Add spaced repetition fields to key_ideas

Revision ID: 20260502_000012
Revises: 20260502_000011
Create Date: 2026-05-02 00:00:12.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260502_000012"
down_revision: Union[str, None] = "20260502_000011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("key_ideas", sa.Column("sr_interval", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("key_ideas", sa.Column("sr_repetitions", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("key_ideas", sa.Column("sr_ease_factor", sa.Float(), nullable=False, server_default="2.5"))
    op.add_column(
        "key_ideas",
        sa.Column(
            "sr_due_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )


def downgrade() -> None:
    op.drop_column("key_ideas", "sr_due_date")
    op.drop_column("key_ideas", "sr_ease_factor")
    op.drop_column("key_ideas", "sr_repetitions")
    op.drop_column("key_ideas", "sr_interval")
