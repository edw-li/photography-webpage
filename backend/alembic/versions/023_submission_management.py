"""Track submission revisions, prepared uploads, and durable image cleanup.

Revision ID: 023
Revises: 022
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("contests", sa.Column("submissions_locked_at", sa.DateTime(timezone=True)))
    op.add_column("contest_submissions", sa.Column("revision", sa.Integer(), nullable=False, server_default="1"))
    for name in ("updated_at", "image_submitted_at"):
        op.add_column("contest_submissions", sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")))
    op.execute("UPDATE contest_submissions SET updated_at = created_at, image_submitted_at = created_at")
    # Also freeze any reverted contest with evidence that judging already began.
    op.execute("""
        UPDATE contests c SET submissions_locked_at = c.updated_at
        WHERE c.status IN ('voting', 'completed') OR c.is_imported
          OR EXISTS (SELECT 1 FROM contest_votes v WHERE v.contest_id = c.id)
          OR EXISTS (SELECT 1 FROM gallery_photos g WHERE g.contest_id = c.id)
    """)
    op.create_table("submission_assets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False, unique=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True)),
        sa.Column("contest_id", sa.Integer(), sa.ForeignKey("contests.id", ondelete="SET NULL")),
        sa.Column("target_submission_id", sa.Integer()),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("object_keys", postgresql.JSONB(), nullable=False),
        sa.Column("exif", postgresql.JSONB(), nullable=False),
        sa.Column("checksum", sa.String(64)),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_submission_assets_expires_at", "submission_assets", ["expires_at"])
    # One registry entry per existing URL; files and historical ownership are unchanged.
    op.execute("""
        INSERT INTO submission_assets (id, url, state, object_keys, exif)
        SELECT md5(url)::uuid, url, 'attached', '[]'::jsonb, '{}'::jsonb
        FROM (SELECT url FROM contest_submissions UNION SELECT url FROM gallery_photos) urls
    """)
    op.create_table("submission_operations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("contest_id", sa.Integer(), nullable=False),
        sa.Column("submission_id", sa.Integer()),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("previous", postgresql.JSONB()),
        sa.Column("result", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_submission_operations_user_id", "submission_operations", ["user_id"])
    op.create_table("storage_cleanup_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False, unique=True),
        sa.Column("not_before", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text()),
    )
    op.create_index("ix_storage_cleanup_jobs_not_before", "storage_cleanup_jobs", ["not_before"])


def downgrade():
    op.drop_table("storage_cleanup_jobs")
    op.drop_table("submission_operations")
    op.drop_table("submission_assets")
    for name in ("image_submitted_at", "updated_at", "revision"):
        op.drop_column("contest_submissions", name)
    op.drop_column("contests", "submissions_locked_at")
