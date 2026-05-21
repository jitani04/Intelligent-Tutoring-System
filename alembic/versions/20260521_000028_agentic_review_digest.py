"""Add agentic review digest preferences and action tables

Revision ID: 20260521_000028
Revises: 20260520_000027
Create Date: 2026-05-21 00:00:28.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260521_000028"
down_revision: Union[str, None] = "20260520_000027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("enable_review_emails", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("users", sa.Column("reminder_frequency", sa.String(length=32), server_default="before_deadlines_only", nullable=False))
    op.add_column("users", sa.Column("preferred_reminder_time", sa.Time(), nullable=True))
    op.add_column("users", sa.Column("review_email_address", sa.String(length=320), nullable=True))
    op.add_column("users", sa.Column("digest_style", sa.String(length=32), server_default="concise", nullable=False))
    op.add_column("users", sa.Column("include_key_notes", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("users", sa.Column("include_outside_study_suggestions", sa.Boolean(), server_default="true", nullable=False))
    op.add_column("project_profiles", sa.Column("next_recommended_action", sa.JSON(), nullable=True))

    op.create_table(
        "pending_agent_actions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("action_type", sa.String(length=80), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("preview", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_pending_agent_actions_user_id", "pending_agent_actions", ["user_id"])
    op.create_index("ix_pending_agent_actions_conversation_id", "pending_agent_actions", ["conversation_id"])
    op.create_index("ix_pending_agent_actions_subject", "pending_agent_actions", ["subject"])
    op.create_index("ix_pending_agent_actions_action_type", "pending_agent_actions", ["action_type"])
    op.create_index("ix_pending_agent_actions_status", "pending_agent_actions", ["status"])

    op.create_table(
        "review_digest_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("trigger_type", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("skipped_reason", sa.Text(), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_review_digest_logs_user_id", "review_digest_logs", ["user_id"])
    op.create_index("ix_review_digest_logs_subject", "review_digest_logs", ["subject"])
    op.create_index("ix_review_digest_logs_trigger_type", "review_digest_logs", ["trigger_type"])
    op.create_index("ix_review_digest_logs_status", "review_digest_logs", ["status"])


def downgrade() -> None:
    op.drop_index("ix_review_digest_logs_status", table_name="review_digest_logs")
    op.drop_index("ix_review_digest_logs_trigger_type", table_name="review_digest_logs")
    op.drop_index("ix_review_digest_logs_subject", table_name="review_digest_logs")
    op.drop_index("ix_review_digest_logs_user_id", table_name="review_digest_logs")
    op.drop_table("review_digest_logs")
    op.drop_index("ix_pending_agent_actions_status", table_name="pending_agent_actions")
    op.drop_index("ix_pending_agent_actions_action_type", table_name="pending_agent_actions")
    op.drop_index("ix_pending_agent_actions_subject", table_name="pending_agent_actions")
    op.drop_index("ix_pending_agent_actions_conversation_id", table_name="pending_agent_actions")
    op.drop_index("ix_pending_agent_actions_user_id", table_name="pending_agent_actions")
    op.drop_table("pending_agent_actions")
    op.drop_column("project_profiles", "next_recommended_action")
    op.drop_column("users", "include_outside_study_suggestions")
    op.drop_column("users", "include_key_notes")
    op.drop_column("users", "digest_style")
    op.drop_column("users", "review_email_address")
    op.drop_column("users", "preferred_reminder_time")
    op.drop_column("users", "reminder_frequency")
    op.drop_column("users", "enable_review_emails")
