"""initial tables

Revision ID: 001
Revises:
Create Date: 2026-02-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), server_default="member", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.CheckConstraint("role IN ('admin', 'member')", name="ck_users_role"),
    )

    op.create_table(
        "members",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("specialty", sa.String(200), nullable=False),
        sa.Column("avatar_url", sa.Text(), nullable=False),
        sa.Column("photography_type", sa.String(200), nullable=True),
        sa.Column("leadership_role", sa.String(100), nullable=True),
        sa.Column("website", sa.Text(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("user_id"),
    )

    op.create_table(
        "social_links",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("member_id", "platform", name="uq_social_links_member_platform"),
    )

    op.create_table(
        "sample_photos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("src_url", sa.Text(), nullable=False),
        sa.Column("caption", sa.String(500), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "gallery_photos",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("photographer", sa.String(200), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("exif_camera", sa.String(100), nullable=True),
        sa.Column("exif_focal_length", sa.String(50), nullable=True),
        sa.Column("exif_iso", sa.Integer(), nullable=True),
        sa.Column("exif_aperture", sa.String(50), nullable=True),
        sa.Column("exif_shutter_speed", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"], ondelete="SET NULL"),
    )


def downgrade() -> None:
    op.drop_table("gallery_photos")
    op.drop_table("sample_photos")
    op.drop_table("social_links")
    op.drop_table("members")
    op.drop_table("users")
