"""release notes table

Revision ID: 021
Revises: 020
Create Date: 2026-06-06
"""

from alembic import op
import sqlalchemy as sa

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "release_notes",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("date", sa.String(10), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default=sa.text("true"), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("version", name="uq_release_notes_version"),
    )


def downgrade() -> None:
    op.drop_table("release_notes")
