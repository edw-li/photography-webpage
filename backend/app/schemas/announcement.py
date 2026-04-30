import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator, model_validator

from .common import CamelModel


Severity = Literal["info", "warning", "critical"]
Audience = Literal["public", "authenticated", "admin"]

# Reject protocol-relative URLs (`//evil.com`) and backslash-prefixed paths
# (`/\evil.com`) — both can navigate off-site or be quirkily normalized.
_CTA_URL_RE = re.compile(r"^(https?://|/(?![/\\]))", re.IGNORECASE)


def _validate_cta_url(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value == "":
        return None
    if not _CTA_URL_RE.match(value):
        raise ValueError(
            "ctaUrl must start with http://, https://, or a relative path "
            "starting with / (not //)"
        )
    return value


class AnnouncementBase(CamelModel):
    title: str = Field(min_length=1, max_length=300)
    body_md: str = Field(min_length=1, max_length=2000)
    severity: Severity = "info"
    audience: Audience = "public"
    priority: int = 0
    is_dismissable: bool = True
    cta_label: str | None = Field(default=None, max_length=60)
    cta_url: str | None = Field(default=None, max_length=500)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True

    @field_validator("cta_url")
    @classmethod
    def _check_cta_url(cls, v: str | None) -> str | None:
        return _validate_cta_url(v)

    @field_validator("cta_label")
    @classmethod
    def _strip_cta_label(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None

    @model_validator(mode="after")
    def _check_schedule_and_cta(self) -> "AnnouncementBase":
        if self.starts_at is not None and self.ends_at is not None:
            if self.ends_at <= self.starts_at:
                raise ValueError("endsAt must be after startsAt")
        # CTA label and URL go together: either both set or both null.
        if (self.cta_label is None) != (self.cta_url is None):
            raise ValueError("ctaLabel and ctaUrl must both be provided or both be empty")
        return self


class AnnouncementCreate(AnnouncementBase):
    id: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9][a-z0-9-]*$")


class AnnouncementUpdate(CamelModel):
    """All fields optional; null-vs-omitted distinguished only by Pydantic default."""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    body_md: str | None = Field(default=None, min_length=1, max_length=2000)
    severity: Severity | None = None
    audience: Audience | None = None
    priority: int | None = None
    is_dismissable: bool | None = None
    cta_label: str | None = Field(default=None, max_length=60)
    cta_url: str | None = Field(default=None, max_length=500)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool | None = None

    @field_validator("cta_url")
    @classmethod
    def _check_cta_url(cls, v: str | None) -> str | None:
        return _validate_cta_url(v)

    @field_validator("cta_label")
    @classmethod
    def _strip_cta_label(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        return v or None


class AnnouncementResponse(CamelModel):
    """Full read shape — admin-only fields included."""

    id: str
    title: str
    body_md: str
    html: str
    severity: Severity
    audience: Audience
    priority: int
    is_dismissable: bool
    cta_label: str | None
    cta_url: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    is_active: bool
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    dismissal_count: int = 0


class ActiveAnnouncementResponse(CamelModel):
    """Slim shape served to public consumers — no admin metadata, no markdown source."""

    id: str
    title: str
    html: str
    severity: Severity
    is_dismissable: bool
    cta_label: str | None
    cta_url: str | None
