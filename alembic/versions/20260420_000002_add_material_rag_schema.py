"""Add material RAG schema

Revision ID: 20260420_000002
Revises: 20250225_000001
Create Date: 2026-04-20 00:00:02.000000

"""

from typing import Sequence, Union

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260420_000002"
down_revision: Union[str, None] = "20250225_000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

material_status = postgresql.ENUM("processing", "ready", "failed", name="material_status", create_type=False)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    material_status.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "materials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column("status", material_status, server_default="processing", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_materials_user_id"), "materials", ["user_id"], unique=False)
    op.create_index("ix_materials_status_created_at", "materials", ["status", "created_at"], unique=False)

    op.create_table(
        "material_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("material_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=False),
        sa.Column("char_start", sa.Integer(), nullable=False),
        sa.Column("char_end", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_chunks_material_id"), "material_chunks", ["material_id"], unique=False)
    op.create_index("ix_material_chunks_material_chunk_index", "material_chunks", ["material_id", "chunk_index"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_material_chunks_material_chunk_index", table_name="material_chunks")
    op.drop_index(op.f("ix_material_chunks_material_id"), table_name="material_chunks")
    op.drop_table("material_chunks")

    op.drop_index("ix_materials_status_created_at", table_name="materials")
    op.drop_index(op.f("ix_materials_user_id"), table_name="materials")
    op.drop_table("materials")
    material_status.drop(op.get_bind(), checkfirst=True)
