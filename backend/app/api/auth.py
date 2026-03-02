import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.user import User
from ..models.member import Member, SocialLink, SamplePhoto
from ..schemas.common import PaginatedResponse
from ..schemas.user import (
    ProfileUpdate,
    RefreshRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
    UserWithMember,
)
from ..schemas.member import MemberResponse
from ..services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from .deps import get_current_user, get_db, require_admin

router = APIRouter()


def _member_to_response(member: Member) -> MemberResponse:
    social_links_dict = {sl.platform: sl.url for sl in member.social_links} or None
    sample_photos_list = (
        [{"src": sp.src_url, "caption": sp.caption} for sp in member.sample_photos]
        or None
    )
    return MemberResponse(
        id=member.id,
        name=member.name,
        specialty=member.specialty,
        avatar=member.avatar_url,
        photography_type=member.photography_type,
        leadership_role=member.leadership_role,
        website=member.website,
        social_links=social_links_dict,
        bio=member.bio,
        sample_photos=sample_photos_list,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        first_name=body.first_name,
        last_name=body.last_name,
    )
    db.add(user)
    await db.flush()
    member = Member(
        user_id=user.id,
        name=f"{body.first_name} {body.last_name}",
        specialty="General Photography",
        avatar_url="DEFAULT",
    )
    db.add(member)
    await db.commit()
    await db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_token(body.refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserWithMember)
async def get_me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.user_id == user.id))
    member = result.scalar_one_or_none()
    member_resp = _member_to_response(member) if member else None
    return UserWithMember(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        member=member_resp,
    )


@router.put("/profile", response_model=UserWithMember)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name

    result = await db.execute(select(Member).where(Member.user_id == user.id))
    member = result.scalar_one_or_none()

    if member is None:
        member = Member(
            user_id=user.id,
            name=f"{user.first_name} {user.last_name}",
            specialty=body.specialty or "General Photography",
            avatar_url=body.avatar or "DEFAULT",
        )
        db.add(member)
    else:
        # Update name from first/last
        member.name = f"{body.first_name or user.first_name} {body.last_name or user.last_name}"
        if body.specialty is not None:
            member.specialty = body.specialty
        if body.avatar is not None:
            member.avatar_url = body.avatar
        if body.photography_type is not None:
            member.photography_type = body.photography_type
        if body.website is not None:
            member.website = body.website
        if body.bio is not None:
            member.bio = body.bio

    if body.social_links is not None:
        member.social_links.clear()
        for platform, url in body.social_links.items():
            member.social_links.append(SocialLink(platform=platform, url=url))

    if body.sample_photos is not None:
        member.sample_photos.clear()
        for i, sp in enumerate(body.sample_photos):
            member.sample_photos.append(
                SamplePhoto(src_url=sp.src, caption=sp.caption, sort_order=i)
            )

    await db.commit()
    await db.refresh(user)
    await db.refresh(member)
    member_resp = _member_to_response(member)
    return UserWithMember(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        member=member_resp,
    )


@router.get("/users", response_model=PaginatedResponse[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(User))
    total = count_result.scalar_one()

    result = await db.execute(
        select(User).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    users = result.scalars().all()

    return PaginatedResponse(
        items=[
            UserResponse(
                id=u.id, email=u.email, first_name=u.first_name, last_name=u.last_name,
                role=u.role, is_active=u.is_active,
                created_at=u.created_at, updated_at=u.updated_at,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
    await db.commit()
    await db.refresh(target)
    return UserResponse(
        id=target.id, email=target.email, first_name=target.first_name,
        last_name=target.last_name, role=target.role, is_active=target.is_active,
        created_at=target.created_at, updated_at=target.updated_at,
    )
