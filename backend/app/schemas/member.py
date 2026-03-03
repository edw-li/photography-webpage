from .common import CamelModel


class SamplePhotoSchema(CamelModel):
    src: str
    caption: str | None = None


class MemberResponse(CamelModel):
    """Matches the frontend Member interface."""

    id: int
    name: str
    specialty: str
    avatar: str
    photography_type: str | None = None
    leadership_role: str | None = None
    website: str | None = None
    social_links: dict[str, str] | None = None
    bio: str | None = None
    sample_photos: list[SamplePhotoSchema] | None = None


class MemberAdminResponse(MemberResponse):
    """Extended member response with linked user account info."""

    user_id: str | None = None
    email: str | None = None
    user_role: str | None = None
    is_active: bool | None = None


class MemberCreate(CamelModel):
    name: str
    specialty: str
    avatar: str
    photography_type: str | None = None
    leadership_role: str | None = None
    website: str | None = None
    social_links: dict[str, str] | None = None
    bio: str | None = None
    sample_photos: list[SamplePhotoSchema] | None = None


class MemberUpdate(CamelModel):
    name: str | None = None
    specialty: str | None = None
    avatar: str | None = None
    photography_type: str | None = None
    leadership_role: str | None = None
    website: str | None = None
    social_links: dict[str, str] | None = None
    bio: str | None = None
    sample_photos: list[SamplePhotoSchema] | None = None
