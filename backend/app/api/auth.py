import logging
import math
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..rate_limit import limiter, PUBLIC_POST, AUTH_ATTEMPT, EMAIL_TRIGGER

from ..models.user import User
from ..models.member import Member, SocialLink, SamplePhoto
from ..models.subscriber import NewsletterSubscriber
from ..schemas.common import CamelModel, PaginatedResponse
from ..schemas.user import (
    ForgotPasswordRequest,
    MessageResponse,
    ProfileUpdate,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
    UserUpdate,
    UserWithMember,
)
from ..schemas.member import MemberResponse, SamplePhotoCaptionUpdate, SamplePhotoCreate, SamplePhotoResponse
from ..services.storage import delete_uploaded_image
from ..services.auth_service import (
    _password_fingerprint,
    create_access_token,
    create_refresh_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
    verify_reset_token,
)
from ..services.email_service import send_password_reset_email
from .deps import get_current_user, get_db, require_admin, verify_turnstile_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _member_to_response(member: Member) -> MemberResponse:
    social_links_dict = {sl.platform: sl.url for sl in member.social_links} or None
    sample_photos_list = (
        [{"id": sp.id, "src": sp.src_url, "caption": sp.caption} for sp in member.sample_photos]
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
@limiter.limit(PUBLIC_POST)
async def register(request: Request, body: UserRegister, db: AsyncSession = Depends(get_db)):
    # Honeypot: if filled, return fake success
    if body.company:
        return TokenResponse(access_token="ok", refresh_token="ok")
    await verify_turnstile_token(body.turnstile_token)
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

    # Auto-subscribe to newsletter
    sub_result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == body.email)
    )
    existing_sub = sub_result.scalar_one_or_none()
    if existing_sub is None:
        db.add(NewsletterSubscriber(
            email=body.email,
            name=f"{body.first_name} {body.last_name}",
        ))
    elif not existing_sub.is_active:
        existing_sub.is_active = True
        existing_sub.name = f"{body.first_name} {body.last_name}"

    await db.commit()
    await db.refresh(user)
    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(AUTH_ATTEMPT)
async def login(request: Request, body: UserLogin, db: AsyncSession = Depends(get_db)):
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


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(EMAIL_TRIGGER)
async def forgot_password(request: Request, body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    await verify_turnstile_token(body.turnstile_token)
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is not None and user.is_active:
        try:
            token = create_reset_token(str(user.id), user.hashed_password)
            await send_password_reset_email(user.email, token)
        except Exception:
            logger.exception("Failed to send password reset email to %s", body.email)
    return MessageResponse(message="If an account with that email exists, a reset link has been sent.")


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit(AUTH_ATTEMPT)
async def reset_password(request: Request, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    payload = verify_reset_token(body.token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link.",
        )
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )
    if _password_fingerprint(user.hashed_password) != payload.get("phash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link has already been used.",
        )
    user.hashed_password = hash_password(body.new_password)
    await db.commit()
    return MessageResponse(message="Your password has been reset successfully.")


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
            if (member.avatar_url and member.avatar_url != "DEFAULT"
                    and member.avatar_url != body.avatar):
                delete_uploaded_image(member.avatar_url, thumbnails=False)
            member.avatar_url = body.avatar
        if body.photography_type is not None:
            member.photography_type = body.photography_type
        if body.website is not None:
            member.website = body.website
        if body.bio is not None:
            member.bio = body.bio

    if body.social_links is not None:
        member.social_links.clear()
        await db.flush()  # force DELETEs before INSERTs
        for platform, url in body.social_links.items():
            member.social_links.append(SocialLink(platform=platform, url=url))

    if body.sample_photos is not None:
        new_urls = {sp.src for sp in body.sample_photos}
        for old_photo in member.sample_photos:
            if old_photo.src_url not in new_urls:
                delete_uploaded_image(old_photo.src_url)
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


@router.post("/profile/sample-photos", response_model=SamplePhotoResponse, status_code=status.HTTP_201_CREATED)
async def add_sample_photo(
    body: SamplePhotoCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.user_id == user.id))
    member = result.scalar_one_or_none()

    if member is None:
        member = Member(
            user_id=user.id,
            name=f"{user.first_name} {user.last_name}",
            specialty="General Photography",
            avatar_url="DEFAULT",
        )
        db.add(member)
        await db.flush()

    if len(member.sample_photos) >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum of 3 sample photos allowed",
        )

    max_order = max((sp.sort_order for sp in member.sample_photos), default=-1)
    photo = SamplePhoto(
        member_id=member.id,
        src_url=body.src,
        caption=body.caption,
        sort_order=max_order + 1,
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return SamplePhotoResponse(id=photo.id, src=photo.src_url, caption=photo.caption)


@router.delete("/profile/sample-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sample_photo(
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.user_id == user.id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    photo = next((sp for sp in member.sample_photos if sp.id == photo_id), None)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    delete_uploaded_image(photo.src_url)
    await db.delete(photo)
    await db.commit()


@router.patch("/profile/sample-photos", status_code=status.HTTP_200_OK)
async def update_sample_photo_captions(
    body: list[SamplePhotoCaptionUpdate],
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.user_id == user.id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    photo_map = {sp.id: sp for sp in member.sample_photos}
    for update in body:
        photo = photo_map.get(update.id)
        if photo is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Photo {update.id} not found",
            )
        photo.caption = update.caption

    await db.commit()
    return {"detail": "Captions updated"}


class SubscriptionToggle(CamelModel):
    subscribed: bool


@router.get("/subscription-status")
async def get_subscription_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == user.email)
    )
    subscriber = result.scalar_one_or_none()
    return {"subscribed": subscriber is not None and subscriber.is_active}


@router.put("/subscription")
async def update_subscription(
    body: SubscriptionToggle,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(NewsletterSubscriber).where(NewsletterSubscriber.email == user.email)
    )
    subscriber = result.scalar_one_or_none()

    if body.subscribed:
        if subscriber is None:
            # Get member name if available
            member_result = await db.execute(select(Member).where(Member.user_id == user.id))
            member = member_result.scalar_one_or_none()
            name = member.name if member else f"{user.first_name} {user.last_name}"
            db.add(NewsletterSubscriber(email=user.email, name=name))
        elif not subscriber.is_active:
            subscriber.is_active = True
    else:
        if subscriber is not None and subscriber.is_active:
            subscriber.is_active = False

    await db.commit()
    return {"subscribed": body.subscribed}


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
