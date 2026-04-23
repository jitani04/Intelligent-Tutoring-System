"""Add Google auth and onboarding fields

Revision ID: 20260422_000008
Revises: 20260422_000007
Create Date: 2026-04-22 00:00:08.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260422_000008"
down_revision: Union[str, None] = "20260422_000007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=True)
    op.add_column("users", sa.Column("google_id", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("use_case", sa.String(length=100), nullable=True))
    op.add_column(
        "users",
        sa.Column("onboarding_complete", sa.Boolean(), server_default="false", nullable=False),
    )
    op.create_index(op.f("ix_users_google_id"), "users", ["google_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_users_google_id"), table_name="users")
    op.drop_column("users", "onboarding_complete")
    op.drop_column("users", "use_case")
    op.drop_column("users", "name")
    op.drop_column("users", "google_id")
    op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)
