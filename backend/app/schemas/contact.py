from datetime import datetime

from .common import CamelModel


class ContactSubmissionCreate(CamelModel):
    name: str
    email: str
    message: str


class ContactReplyRequest(CamelModel):
    reply_body: str


class ContactSubmissionResponse(CamelModel):
    id: int
    name: str
    email: str
    message: str
    created_at: datetime
    replied: bool
    replied_at: datetime | None = None
    replied_by: str | None = None
    reply_message: str | None = None
