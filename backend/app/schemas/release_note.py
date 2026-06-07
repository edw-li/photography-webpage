from pydantic import Field

from .common import CamelModel


class ReleaseNoteResponse(CamelModel):
    """Matches the frontend ReleaseNote interface."""

    id: int
    version: str
    date: str
    html: str
    body_md: str
    is_published: bool


class ReleaseNoteCreate(CamelModel):
    version: str = Field(min_length=1, max_length=50)
    date: str = Field(min_length=1, max_length=10)
    body_md: str = Field(min_length=1)
    is_published: bool = True


class ReleaseNoteUpdate(CamelModel):
    version: str | None = Field(default=None, min_length=1, max_length=50)
    date: str | None = Field(default=None, min_length=1, max_length=10)
    body_md: str | None = Field(default=None, min_length=1)
    is_published: bool | None = None
