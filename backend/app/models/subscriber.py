from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    subscribed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    unsubscribe_token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=lambda: uuid4().hex
    )
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    verification_token: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
