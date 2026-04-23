"""add project_profiles table

Revision ID: 20260422_000007
Revises: 20260422_000006
Create Date: 2026-04-22

"""
import sqlalchemy as sa
from alembic import op

revision = "20260422_000007"
down_revision = "20260422_000006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_profiles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("subject", sa.String(255), nullable=False),
        sa.Column("level", sa.String(50), nullable=True),
        sa.Column("goals", sa.Text(), nullable=True),
        sa.Column("mind_map", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "subject", name="uq_project_profile_user_subject"),
    )


def downgrade() -> None:
    op.drop_table("project_profiles")
