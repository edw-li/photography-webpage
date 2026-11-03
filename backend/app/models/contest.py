import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text,
    UniqueConstraint, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base

VOTE_CATEGORIES = ["theme", "favorite", "wildcard"]
MAX_VOTES_PER_CATEGORY = 3
MAX_SUBMISSIONS_PER_USER = 3

# How a contest is voted on and scored. "classic": approve up to 3 photos in
# each of three categories, three separate podiums (every contest completed
# before November 2026). "points": rank the top 3 for the theme (3/2/1 pts)
# plus one Favorite and one Bonus point, one leaderboard. Never inferred from
# dates — completed contests keep the format they ran under.
VOTING_FORMAT_CLASSIC = "classic"
VOTING_FORMAT_POINTS = "points"
VOTING_FORMATS = (VOTING_FORMAT_CLASSIC, VOTING_FORMAT_POINTS)
THEME_RANKS = 3


class Contest(Base):
    __tablename__ = "contests"
    __table_args__ = (
        CheckConstraint(
            "voting_format IN ('" + "', '".join(VOTING_FORMATS) + "')",
            name="ck_contests_voting_format",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    month: Mapped[str] = mapped_column(String(50), nullable=False)
    theme: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # active / voting / completed
    deadline: Mapped[str] = mapped_column(String(10), nullable=False)
    guidelines: Mapped[list] = mapped_column(JSONB, nullable=False)
    wildcard_category: Mapped[str | None] = mapped_column(String(200), nullable=True)
    winners: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    honorable_mentions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    is_imported: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    voting_format: Mapped[str] = mapped_column(
        String(20), nullable=False, default=VOTING_FORMAT_POINTS, server_default=VOTING_FORMAT_POINTS
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    submissions_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submissions: Mapped[list["ContestSubmission"]] = relationship(
        back_populates="contest", cascade="all, delete-orphan", lazy="selectin",
        order_by="ContestSubmission.id",
    )


class ContestSubmission(Base):
    __tablename__ = "contest_submissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False
    )
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    photographer: Mapped[str] = mapped_column(String(200), nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Headline tally set when the contest completes: total votes across
    # categories for classic contests, total points for points contests.
    vote_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    exif_camera: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exif_focal_length: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_aperture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_shutter_speed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_iso: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_vote_tallies: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Points contests: this photo's result, frozen when the contest completes
    # (see points_scoring.snapshot) so later ballot changes can't rewrite it.
    points_score: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    image_submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    contest: Mapped["Contest"] = relationship(back_populates="submissions")


class ContestVote(Base):
    __tablename__ = "contest_votes"
    __table_args__ = (
        UniqueConstraint(
            "contest_id", "user_id", "category", "submission_id",
            name="uq_contest_votes_contest_user_category_sub",
        ),
        CheckConstraint("rank IS NULL OR rank BETWEEN 1 AND 3", name="ck_contest_votes_rank"),
        # A points ballot holds each theme rank (1st / 2nd / 3rd) at most once.
        Index(
            "uq_contest_votes_contest_user_category_rank",
            "contest_id", "user_id", "category", "rank",
            unique=True,
            postgresql_where=text("rank IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False
    )
    submission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contest_submissions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    # Theme rows of a points ballot: 1-3. NULL for favorite/bonus rows and for
    # every classic vote.
    rank: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )


class ContestVoteArchive(Base):
    """Ballots set aside when a contest's voting format changed mid-vote.

    Kept so the reset is recoverable; nothing reads these for scoring.
    """

    __tablename__ = "contest_vote_archive"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contest_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Plain values (no foreign keys): the record should outlive later edits.
    submission_id: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    rank: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    voted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    reason: Mapped[str] = mapped_column(String(100), nullable=False)
