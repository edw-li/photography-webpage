from datetime import datetime

from pydantic import Field

from .common import CamelModel


class GalleryCommentCreate(CamelModel):
    body: str = Field(..., min_length=1, max_length=1000)


class GalleryCommentUpdate(CamelModel):
    body: str = Field(..., min_length=1, max_length=1000)


class GalleryCommentResponse(CamelModel):
    id: int
    photo_id: int
    user_id: str | None  # null if commenter's account was deleted
    author_name: str | None  # snapshot from member at fetch time; null if user deleted
    author_avatar: str | None
    body: str
    created_at: datetime
    updated_at: datetime
    edited: bool  # updated_at differs from created_at by > 60s
    is_own: bool  # whether viewer authored this comment
