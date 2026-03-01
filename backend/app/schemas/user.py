from __future__ import annotations

import uuid
from datetime import datetime

from .common import CamelModel


class UserRegister(CamelModel):
    email: str
    password: str


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
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserWithMember(UserResponse):
    member: MemberResponse | None = None


class UserUpdate(CamelModel):
    role: str | None = None
    is_active: bool | None = None


# Deferred import for forward reference resolution
from .member import MemberResponse  # noqa: E402, F811

UserWithMember.model_rebuild()
