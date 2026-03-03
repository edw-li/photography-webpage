from __future__ import annotations

import uuid
from datetime import datetime

from .common import CamelModel


class UserRegister(CamelModel):
    email: str
    password: str
    first_name: str
    last_name: str


class UserLogin(CamelModel):
    email: str
    password: str


class TokenResponse(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(CamelModel):
    refresh_token: str


class UserResponse(CamelModel):
    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserWithMember(UserResponse):
    member: MemberResponse | None = None


class UserUpdate(CamelModel):
    role: str | None = None
    is_active: bool | None = None


class ProfileUpdate(CamelModel):
    first_name: str | None = None
    last_name: str | None = None
    specialty: str | None = None
    avatar: str | None = None
    photography_type: str | None = None
    website: str | None = None
    bio: str | None = None
    social_links: dict[str, str] | None = None
    sample_photos: list[SamplePhotoSchema] | None = None


class ForgotPasswordRequest(CamelModel):
    email: str


class ResetPasswordRequest(CamelModel):
    token: str
    new_password: str


class MessageResponse(CamelModel):
    message: str


# Deferred import for forward reference resolution
from .member import MemberResponse, SamplePhotoSchema  # noqa: E402, F811

UserWithMember.model_rebuild()
ProfileUpdate.model_rebuild()
