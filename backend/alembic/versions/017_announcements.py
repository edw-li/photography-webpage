"""announcements

Revision ID: 017
Revises: 016
Create Date: 2026-04-30
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "announcements",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body_md", sa.Text(), nullable=False),
        sa.Column("html", sa.Text(), nullable=False),
        sa.Column(
            "severity", sa.String(20), nullable=False, server_default="info"
        ),
        sa.Column(
            "audience", sa.String(20), nullable=False, server_default="public"
        ),
        sa.Column(
            "priority", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "is_dismissable",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column("cta_label", sa.String(60), nullable=True),
        sa.Column("cta_url", sa.String(500), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
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
    # Composite index that supports the active-banner query: filter by is_active,
    # order by priority DESC, with schedule columns for range checks.
    op.create_index(
        "ix_announcements_active_priority",
        "announcements",
        ["is_active", sa.text("priority DESC"), "starts_at", "ends_at"],
    )

    op.create_table(
        "announcement_dismissals",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "announcement_id",
            sa.String(100),
            sa.ForeignKey("announcements.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "dismissed_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "announcement_id", "user_id", name="uq_announcement_dismissals_pair"
        ),
    )
    op.create_index(
        "ix_announcement_dismissals_user",
        "announcement_dismissals",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_announcement_dismissals_user", table_name="announcement_dismissals"
    )
    op.drop_table("announcement_dismissals")

    op.drop_index("ix_announcements_active_priority", table_name="announcements")
    op.drop_table("announcements")
