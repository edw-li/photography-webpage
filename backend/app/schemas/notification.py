from datetime import datetime

from .common import CamelModel


class NotificationResponse(CamelModel):
    id: int
    type: str
    payload: dict
    is_read: bool
    created_at: datetime


class UnreadCountResponse(CamelModel):
    count: int
