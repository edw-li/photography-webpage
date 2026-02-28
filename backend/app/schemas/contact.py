from datetime import datetime

from .common import CamelModel


class ContactSubmissionCreate(CamelModel):
    name: str
    email: str
    message: str


class ContactSubmissionResponse(CamelModel):
    id: int
    name: str
    email: str
    message: str
    created_at: datetime
