"""Points voting: per-contest voting format, ranked theme votes, ballot archive.

Every contest that has already been voted on (or was imported) keeps the
classic three-category rules; everything else switches to the points
leaderboard. A contest that is mid-vote stays classic here and is switched
deliberately afterwards with scripts/switch_contest_to_points.py (this
migration runs on every backend start, so it must not touch anyone's ballot).

Roll back by restoring a backup rather than downgrading once any points
contest has ballots: the downgrade would leave ranked ballots and "overall"
winners for the classic code to misread.

Revision ID: 024
Revises: 023
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "024"
down_revision = "023"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "contests",
        sa.Column("voting_format", sa.String(20), nullable=False, server_default="points"),
    )
    op.execute("""
        UPDATE contests c SET voting_format = 'classic'
        WHERE c.status IN ('completed', 'voting') OR c.is_imported
           OR EXISTS (SELECT 1 FROM contest_votes v WHERE v.contest_id = c.id)
    """)
    op.create_check_constraint(
        "ck_contests_voting_format", "contests", "voting_format IN ('classic', 'points')",
    )

    op.add_column("contest_submissions", sa.Column("points_score", postgresql.JSONB(), nullable=True))

    op.add_column("contest_votes", sa.Column("rank", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_contest_votes_rank", "contest_votes", "rank IS NULL OR rank BETWEEN 1 AND 3",
    )
    op.create_index(
        "uq_contest_votes_contest_user_category_rank",
        "contest_votes",
        ["contest_id", "user_id", "category", "rank"],
        unique=True,
        postgresql_where=sa.text("rank IS NOT NULL"),
    )

    op.create_table(
        "contest_vote_archive",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "contest_id", sa.Integer(),
            sa.ForeignKey("contests.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("submission_id", sa.Integer(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("rank", sa.SmallInteger(), nullable=True),
        sa.Column("voted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "archived_at", sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("reason", sa.String(100), nullable=False),
    )
    op.create_index(
        "ix_contest_vote_archive_contest_id", "contest_vote_archive", ["contest_id"],
    )


def downgrade():
    op.drop_index("ix_contest_vote_archive_contest_id", table_name="contest_vote_archive")
    op.drop_table("contest_vote_archive")
    op.drop_index("uq_contest_votes_contest_user_category_rank", table_name="contest_votes")
    op.drop_constraint("ck_contest_votes_rank", "contest_votes", type_="check")
    op.drop_column("contest_votes", "rank")
    op.drop_column("contest_submissions", "points_score")
    op.drop_constraint("ck_contests_voting_format", "contests", type_="check")
    op.drop_column("contests", "voting_format")
