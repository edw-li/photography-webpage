"""Add contest import fields: is_imported, category_vote_tallies, winner_placements

Revision ID: 014
Revises: 013
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contests",
        sa.Column("is_imported", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "contest_submissions",
        sa.Column("category_vote_tallies", JSONB, nullable=True),
    )
    op.add_column(
        "gallery_photos",
        sa.Column("winner_placements", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("gallery_photos", "winner_placements")
    op.drop_column("contest_submissions", "category_vote_tallies")
    op.drop_column("contests", "is_imported")
