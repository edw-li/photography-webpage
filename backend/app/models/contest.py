import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


class Contest(Base):
    __tablename__ = "contests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    month: Mapped[str] = mapped_column(String(50), nullable=False)
    theme: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # active / voting / completed
    deadline: Mapped[str] = mapped_column(String(10), nullable=False)
    guidelines: Mapped[list] = mapped_column(JSONB, nullable=False)
    winners: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    honorable_mentions: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    submissions: Mapped[list["ContestSubmission"]] = relationship(
        back_populates="contest", cascade="all, delete-orphan", lazy="selectin"
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
    vote_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    exif_camera: Mapped[str | None] = mapped_column(String(100), nullable=True)
    exif_focal_length: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_aperture: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_shutter_speed: Mapped[str | None] = mapped_column(String(50), nullable=True)
    exif_iso: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    contest: Mapped["Contest"] = relationship(back_populates="submissions")


class ContestVote(Base):
    __tablename__ = "contest_votes"
    __table_args__ = (
        UniqueConstraint("contest_id", "user_id", name="uq_contest_votes_contest_user"),
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
