"""comment replies (parent_id on gallery_photo_comments)

Revision ID: 019
Revises: 018
Create Date: 2026-05-01
"""

from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gallery_photo_comments",
        sa.Column(
            "parent_id",
            sa.Integer(),
            sa.ForeignKey("gallery_photo_comments.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_gallery_photo_comments_parent_id",
        "gallery_photo_comments",
        ["parent_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_gallery_photo_comments_parent_id",
        table_name="gallery_photo_comments",
    )
    op.drop_column("gallery_photo_comments", "parent_id")
