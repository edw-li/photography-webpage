"""likes, comments, and notifications

Revision ID: 015
Revises: 014
Create Date: 2026-04-29
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gallery_photo_likes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "photo_id",
            sa.Integer(),
            sa.ForeignKey("gallery_photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("photo_id", "user_id", name="uq_gallery_photo_likes_photo_user"),
    )
    op.create_index(
        "ix_gallery_photo_likes_photo_id",
        "gallery_photo_likes",
        ["photo_id"],
    )

    op.create_table(
        "gallery_photo_comments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "photo_id",
            sa.Integer(),
            sa.ForeignKey("gallery_photos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_gallery_photo_comments_photo_created",
        "gallery_photo_comments",
        ["photo_id", sa.text("created_at DESC")],
    )

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "is_read",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_notifications_user_unread_created",
        "notifications",
        ["user_id", "is_read", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_unread_created", table_name="notifications")
    op.drop_table("notifications")

    op.drop_index("ix_gallery_photo_comments_photo_created", table_name="gallery_photo_comments")
    op.drop_table("gallery_photo_comments")

    op.drop_index("ix_gallery_photo_likes_photo_id", table_name="gallery_photo_likes")
    op.drop_table("gallery_photo_likes")
