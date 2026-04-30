"""backfill self-likes for owned photos

Revision ID: 016
Revises: 015
Create Date: 2026-04-30

Reddit-style auto-like: every existing gallery photo whose owner is resolvable
(member_id set, member.user_id set) gets a self-like row inserted on its
owner's behalf. Going forward, new photos auto-like at create time via
backend/app/api/gallery.py::auto_like_photo_owner — this migration just brings
historical photos in line.

Idempotent via ON CONFLICT DO NOTHING, so re-running is safe. Photos without
a resolvable owner are silently skipped (member-less photos, members without
user accounts) — same edge cases the runtime helper handles.

Downgrade is intentionally a no-op: these rows are normal like rows once
inserted, indistinguishable from a manual like by the same user, so removing
them on downgrade would be inappropriate (and would break unrelated likes if
someone really did manually like their own photo).
"""

from alembic import op


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO gallery_photo_likes (photo_id, user_id, created_at)
        SELECT p.id, m.user_id, p.created_at
        FROM gallery_photos p
        JOIN members m ON m.id = p.member_id
        WHERE m.user_id IS NOT NULL
        ON CONFLICT (photo_id, user_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Intentional no-op: see module docstring.
    pass
