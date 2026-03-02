from datetime import datetime

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


class NewsletterCreate(CamelModel):
    id: str
    title: str
    date: str
    category: str
    author: str
    preview: str
    featured: bool = False
    body_md: str


class NewsletterUpdate(CamelModel):
    title: str | None = None
    date: str | None = None
    category: str | None = None
    author: str | None = None
    preview: str | None = None
    featured: bool | None = None
    body_md: str | None = None


class SubscribeRequest(CamelModel):
    name: str
    email: str


class SubscriberResponse(CamelModel):
    id: int
    email: str
    name: str
    is_active: bool
    subscribed_at: datetime
