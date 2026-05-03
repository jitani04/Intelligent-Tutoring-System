"""Add project profile cover image

Revision ID: 20260502_000011
Revises: 20260423_000010
Create Date: 2026-05-02 00:00:11.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260502_000011"
down_revision: Union[str, None] = "20260423_000010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_profiles", sa.Column("cover_image_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("project_profiles", "cover_image_url")
