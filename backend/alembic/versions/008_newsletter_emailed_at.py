"""add emailed_at to newsletters

Revision ID: 008
Revises: 007
Create Date: 2026-03-09
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "newsletters",
        sa.Column("emailed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("newsletters", "emailed_at")
