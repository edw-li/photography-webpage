"""add wildcard_category to contests and category to contest_votes

Revision ID: 007
Revises: 006
Create Date: 2026-03-06
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("contests", sa.Column("wildcard_category", sa.String(200), nullable=True))
    op.add_column(
        "contest_votes",
        sa.Column("category", sa.String(50), nullable=False, server_default="theme"),
    )
    op.drop_constraint("uq_contest_votes_contest_user", "contest_votes", type_="unique")
    op.create_unique_constraint(
        "uq_contest_votes_contest_user_category_sub",
        "contest_votes",
        ["contest_id", "user_id", "category", "submission_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_contest_votes_contest_user_category_sub", "contest_votes", type_="unique")
    op.create_unique_constraint(
        "uq_contest_votes_contest_user",
        "contest_votes",
        ["contest_id", "user_id"],
    )
    op.drop_column("contest_votes", "category")
    op.drop_column("contests", "wildcard_category")
