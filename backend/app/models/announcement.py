import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


# Allowed values — kept in sync with frontend types/announcement.ts.
SEVERITY_INFO = "info"
SEVERITY_WARNING = "warning"
SEVERITY_CRITICAL = "critical"
SEVERITY_VALUES = (SEVERITY_INFO, SEVERITY_WARNING, SEVERITY_CRITICAL)

AUDIENCE_PUBLIC = "public"
AUDIENCE_AUTHENTICATED = "authenticated"
AUDIENCE_ADMIN = "admin"
AUDIENCE_VALUES = (AUDIENCE_PUBLIC, AUDIENCE_AUTHENTICATED, AUDIENCE_ADMIN)


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body_md: Mapped[str] = mapped_column(Text, nullable=False)
    html: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, server_default=SEVERITY_INFO)
    audience: Mapped[str] = mapped_column(String(20), nullable=False, server_default=AUDIENCE_PUBLIC)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    is_dismissable: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    cta_label: Mapped[str | None] = mapped_column(String(60), nullable=True)
    cta_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class AnnouncementDismissal(Base):
    __tablename__ = "announcement_dismissals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    announcement_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("announcements.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    dismissed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint(
            "announcement_id", "user_id", name="uq_announcement_dismissals_pair"
        ),
    )
