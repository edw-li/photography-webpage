"""announcement dismissals_reset_at

Revision ID: 018
Revises: 017
Create Date: 2026-04-30

Adds dismissals_reset_at to announcements. When admin clicks "Reset
Dismissals", this column is stamped with now(). Clients compare their
localStorage dismissal timestamp against it; older local dismissals are
treated as stale and the banner reappears.

Required because deleting rows from announcement_dismissals can't reach
each user's per-device localStorage; without this column, "Reset
Dismissals" appears to do nothing for users who already dismissed.
"""

from alembic import op
import sqlalchemy as sa


revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "announcements",
        sa.Column(
            "dismissals_reset_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("announcements", "dismissals_reset_at")
