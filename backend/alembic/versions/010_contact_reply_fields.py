"""add reply fields to contact_submissions

Revision ID: 010
Revises: 009
Create Date: 2026-03-10
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "contact_submissions",
        sa.Column("replied", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "contact_submissions",
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "contact_submissions",
        sa.Column("replied_by", sa.String(255), nullable=True),
    )
    op.add_column(
        "contact_submissions",
        sa.Column("reply_message", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("contact_submissions", "reply_message")
    op.drop_column("contact_submissions", "replied_by")
    op.drop_column("contact_submissions", "replied_at")
    op.drop_column("contact_submissions", "replied")
