"""Add project cover image attribution

Revision ID: 20260502_000013
Revises: 20260502_000012
Create Date: 2026-05-02 00:00:13.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260502_000013"
down_revision: Union[str, None] = "20260502_000012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("project_profiles", sa.Column("cover_image_source", sa.String(length=50), nullable=True))
    op.add_column("project_profiles", sa.Column("cover_image_source_url", sa.Text(), nullable=True))
    op.add_column("project_profiles", sa.Column("cover_image_photographer", sa.String(length=255), nullable=True))
    op.add_column("project_profiles", sa.Column("cover_image_photographer_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("project_profiles", "cover_image_photographer_url")
    op.drop_column("project_profiles", "cover_image_photographer")
    op.drop_column("project_profiles", "cover_image_source_url")
    op.drop_column("project_profiles", "cover_image_source")
