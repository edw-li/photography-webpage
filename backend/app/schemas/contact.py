from datetime import datetime

from pydantic import EmailStr, Field

from .common import CamelModel


class ContactSubmissionCreate(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(min_length=1, max_length=5000)
    hp: str = ""  # honeypot field
    turnstile_token: str | None = None


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
