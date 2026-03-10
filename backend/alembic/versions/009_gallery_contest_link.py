"""link gallery photos to contests

Revision ID: 009
Revises: 008
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "gallery_photos",
        sa.Column("visible", sa.Boolean(), server_default="true", nullable=False),
    )
    op.add_column(
        "gallery_photos",
        sa.Column(
            "contest_id",
            sa.Integer(),
            sa.ForeignKey("contests.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "gallery_photos",
        sa.Column(
            "contest_submission_id",
            sa.Integer(),
            sa.ForeignKey("contest_submissions.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "gallery_photos",
        sa.Column("is_winner", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "gallery_photos",
        sa.Column("winner_place", sa.Integer(), nullable=True),
    )
    op.add_column(
        "gallery_photos",
        sa.Column("winner_category", sa.String(50), nullable=True),
    )
    op.create_unique_constraint(
        "uq_gallery_contest_submission",
        "gallery_photos",
        ["contest_submission_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_gallery_contest_submission", "gallery_photos", type_="unique")
    op.drop_column("gallery_photos", "winner_category")
    op.drop_column("gallery_photos", "winner_place")
    op.drop_column("gallery_photos", "is_winner")
    op.drop_column("gallery_photos", "contest_submission_id")
    op.drop_column("gallery_photos", "contest_id")
    op.drop_column("gallery_photos", "visible")
