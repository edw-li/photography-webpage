"""revoked tokens table

Revision ID: 011
Revises: 010
Create Date: 2026-03-11
"""

from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_revoked_tokens_token_hash", "revoked_tokens", ["token_hash"])


def downgrade() -> None:
    op.drop_index("ix_revoked_tokens_token_hash", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")
