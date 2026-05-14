"""Add project cover storage key

Revision ID: 20260513_000016
Revises: 20260513_000015
Create Date: 2026-05-13 00:00:16.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260513_000016"
down_revision: Union[str, None] = "20260513_000015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "project_profiles",
        sa.Column("cover_image_storage_key", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("project_profiles", "cover_image_storage_key")
