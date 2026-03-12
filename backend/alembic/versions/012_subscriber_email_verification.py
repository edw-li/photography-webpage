"""subscriber email verification and unsubscribe tokens

Revision ID: 012
Revises: 011
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- newsletter_subscribers ---
    # 1. Add unsubscribe_token as nullable first
    op.add_column(
        "newsletter_subscribers",
        sa.Column("unsubscribe_token", sa.String(64), nullable=True),
    )
    # 2. Backfill existing rows
    op.execute(
        "UPDATE newsletter_subscribers SET unsubscribe_token = replace(gen_random_uuid()::text, '-', '') WHERE unsubscribe_token IS NULL"
    )
    # 3. Set NOT NULL + UNIQUE
    op.alter_column("newsletter_subscribers", "unsubscribe_token", nullable=False)
    op.create_unique_constraint(
        "uq_newsletter_subscribers_unsubscribe_token",
        "newsletter_subscribers",
        ["unsubscribe_token"],
    )

    # 4. Add is_verified (default true so existing subscribers are grandfathered)
    op.add_column(
        "newsletter_subscribers",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    # 5. Change default for new subscribers to false
    op.alter_column(
        "newsletter_subscribers",
        "is_verified",
        server_default=sa.text("false"),
    )

    # 6. Add verification_token
    op.add_column(
        "newsletter_subscribers",
        sa.Column("verification_token", sa.String(64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_newsletter_subscribers_verification_token",
        "newsletter_subscribers",
        ["verification_token"],
    )

    # --- users ---
    # 7. Add is_email_verified (default true so existing users are grandfathered)
    op.add_column(
        "users",
        sa.Column("is_email_verified", sa.Boolean(), nullable=False, server_default=sa.text("true")),
    )
    # 8. Change default for new users to false
    op.alter_column(
        "users",
        "is_email_verified",
        server_default=sa.text("false"),
    )

    # 9. Add email_verification_token
    op.add_column(
        "users",
        sa.Column("email_verification_token", sa.String(64), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_email_verification_token",
        "users",
        ["email_verification_token"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_email_verification_token", "users", type_="unique")
    op.drop_column("users", "email_verification_token")
    op.drop_column("users", "is_email_verified")

    op.drop_constraint("uq_newsletter_subscribers_verification_token", "newsletter_subscribers", type_="unique")
    op.drop_column("newsletter_subscribers", "verification_token")
    op.drop_column("newsletter_subscribers", "is_verified")
    op.drop_constraint("uq_newsletter_subscribers_unsubscribe_token", "newsletter_subscribers", type_="unique")
    op.drop_column("newsletter_subscribers", "unsubscribe_token")
