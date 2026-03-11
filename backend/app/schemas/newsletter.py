from datetime import datetime

from pydantic import EmailStr, Field

from .common import CamelModel


class NewsletterResponse(CamelModel):
    """Matches the frontend Newsletter interface."""

    id: str
    title: str
    date: str
    category: str
    author: str
    preview: str
    featured: bool
    html: str
    body_md: str
    emailed_at: datetime | None = None


class NewsletterCreate(CamelModel):
    id: str
    title: str
    date: str
    category: str
    author: str
    preview: str
    featured: bool = False
    body_md: str
    send_to_subscribers: bool = False


class NewsletterSendResponse(CamelModel):
    newsletter_id: str
    total_subscribers: int
    sent_count: int
    failed_count: int
    emailed_at: datetime


class NewsletterUpdate(CamelModel):
    title: str | None = None
    date: str | None = None
    category: str | None = None
    author: str | None = None
    preview: str | None = None
    featured: bool | None = None
    body_md: str | None = None


class SubscribeRequest(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = ""  # honeypot field
    turnstile_token: str | None = None


class SubscriberResponse(CamelModel):
    id: int
    email: str
    name: str
    is_active: bool
    subscribed_at: datetime
