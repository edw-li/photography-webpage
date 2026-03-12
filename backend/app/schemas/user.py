from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import EmailStr, Field, field_validator

from .common import CamelModel

_PASSWORD_PATTERN = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{8,}$"
)
_PASSWORD_ERROR = (
    "Password must be at least 8 characters and include an uppercase letter, "
    "a lowercase letter, a digit, and a special character."
)


class UserRegister(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    hp: str = ""  # honeypot field
    turnstile_token: str | None = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(_PASSWORD_ERROR)
        return v


class UserLogin(CamelModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    turnstile_token: str | None = None


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
    is_email_verified: bool
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
    email: EmailStr
    turnstile_token: str | None = None


class ResetPasswordRequest(CamelModel):
    token: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not _PASSWORD_PATTERN.match(v):
            raise ValueError(_PASSWORD_ERROR)
        return v


class RegisterResponse(CamelModel):
    message: str


class ResendVerificationRequest(CamelModel):
    email: EmailStr
    turnstile_token: str | None = None


class MessageResponse(CamelModel):
    message: str


# Deferred import for forward reference resolution
from .member import MemberResponse, SamplePhotoSchema  # noqa: E402, F811

UserWithMember.model_rebuild()
ProfileUpdate.model_rebuild()
