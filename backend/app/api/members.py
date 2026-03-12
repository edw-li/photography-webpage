import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.member import Member, SamplePhoto, SocialLink
from ..models.subscriber import NewsletterSubscriber
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.member import (
    MemberAdminResponse,
    MemberCreate,
    MemberResponse,
    MemberUpdate,
    SamplePhotoCaptionUpdate,
    SamplePhotoCreate,
    SamplePhotoResponse,
)
from ..services.storage import delete_uploaded_image
from .activity import log_activity
from .deps import get_current_user, get_db, require_admin

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


def _member_to_admin_response(member: Member, user: User | None) -> MemberAdminResponse:
    social_links_dict = {sl.platform: sl.url for sl in member.social_links} or None
    sample_photos_list = (
        [{"id": sp.id, "src": sp.src_url, "caption": sp.caption} for sp in member.sample_photos]
        or None
    )
    return MemberAdminResponse(
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
        user_id=str(user.id) if user else None,
        email=user.email if user else None,
        user_role=user.role if user else None,
        is_active=user.is_active if user else None,
        is_email_verified=user.is_email_verified if user else None,
    )


@router.get("/admin", response_model=PaginatedResponse[MemberAdminResponse])
async def list_members_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: list members with linked user account info."""
    query = select(Member, User).outerjoin(User, Member.user_id == User.id)
    count_query = select(func.count()).select_from(Member)

    if search:
        pattern = f"%{search}%"
        filter_clause = or_(
            Member.name.ilike(pattern),
            Member.specialty.ilike(pattern),
            User.email.ilike(pattern),
        )
        query = query.where(filter_clause)
        # Count query needs the join too for email search
        count_query = (
            select(func.count())
            .select_from(Member)
            .outerjoin(User, Member.user_id == User.id)
            .where(filter_clause)
        )

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(Member.id).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    return PaginatedResponse(
        items=[_member_to_admin_response(member, user) for member, user in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/leaders", response_model=list[MemberResponse])
async def get_leaders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Member).where(Member.leadership_role.isnot(None)).order_by(Member.id)
    )
    members = result.scalars().all()
    return [_member_to_response(m) for m in members]


@router.get("", response_model=PaginatedResponse[MemberResponse])
async def list_members(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    specialty: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Member)
    count_query = select(func.count()).select_from(Member)

    if specialty:
        query = query.where(Member.specialty == specialty)
        count_query = count_query.where(Member.specialty == specialty)
    if search:
        pattern = f"%{search}%"
        filter_clause = or_(
            Member.name.ilike(pattern),
            Member.specialty.ilike(pattern),
        )
        query = query.where(filter_clause)
        count_query = count_query.where(filter_clause)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.order_by(Member.id).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    members = result.scalars().all()

    return PaginatedResponse(
        items=[_member_to_response(m) for m in members],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member(member_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    return _member_to_response(member)


@router.post("", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
async def create_member(
    body: MemberCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    member = Member(
        name=body.name,
        specialty=body.specialty,
        avatar_url=body.avatar,
        photography_type=body.photography_type,
        leadership_role=body.leadership_role,
        website=body.website,
        bio=body.bio,
    )
    if body.social_links:
        for platform, url in body.social_links.items():
            member.social_links.append(SocialLink(platform=platform, url=url))
    if body.sample_photos:
        for i, photo in enumerate(body.sample_photos):
            member.sample_photos.append(
                SamplePhoto(src_url=photo.src, caption=photo.caption, sort_order=i)
            )
    db.add(member)
    await log_activity(db, admin, "create", "member", str(member.id or ""), f"Created member: {body.name}")
    await db.commit()
    await db.refresh(member)
    return _member_to_response(member)


@router.put("/{member_id}", response_model=MemberResponse)
async def update_member(
    member_id: int,
    body: MemberUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Allow admin or the user linked to this member
    if user.role != "admin" and member.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    if body.name is not None:
        member.name = body.name
    if body.specialty is not None:
        member.specialty = body.specialty
    if body.avatar is not None:
        if (member.avatar_url and member.avatar_url != "DEFAULT"
                and member.avatar_url != body.avatar):
            delete_uploaded_image(member.avatar_url, thumbnails=False)
        member.avatar_url = body.avatar
    if body.photography_type is not None:
        member.photography_type = body.photography_type or None
    if body.leadership_role is not None:
        member.leadership_role = body.leadership_role or None
    if body.website is not None:
        member.website = body.website or None
    if body.bio is not None:
        member.bio = body.bio or None

    if body.social_links is not None:
        member.social_links.clear()
        await db.flush()  # force DELETEs before INSERTs
        for platform, url in body.social_links.items():
            member.social_links.append(SocialLink(platform=platform, url=url))

    if body.sample_photos is not None:
        new_urls = {photo.src for photo in body.sample_photos}
        for old_photo in member.sample_photos:
            if old_photo.src_url not in new_urls:
                delete_uploaded_image(old_photo.src_url)
        member.sample_photos.clear()
        for i, photo in enumerate(body.sample_photos):
            member.sample_photos.append(
                SamplePhoto(src_url=photo.src, caption=photo.caption, sort_order=i)
            )

    await db.commit()
    await db.refresh(member)
    return _member_to_response(member)


@router.delete("/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(
    member_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    # Cascade-delete linked user account if present
    if member.user_id:
        if member.user_id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete your own account",
            )
        user_result = await db.execute(select(User).where(User.id == member.user_id))
        linked_user = user_result.scalar_one_or_none()
        if linked_user:
            # Cascade-delete linked newsletter subscriber
            sub_result = await db.execute(
                select(NewsletterSubscriber).where(NewsletterSubscriber.email == linked_user.email)
            )
            linked_sub = sub_result.scalar_one_or_none()
            if linked_sub:
                await db.delete(linked_sub)
            await db.delete(linked_user)

    if member.avatar_url and member.avatar_url != "DEFAULT":
        delete_uploaded_image(member.avatar_url, thumbnails=False)
    for photo in member.sample_photos:
        delete_uploaded_image(photo.src_url)

    await log_activity(db, admin, "delete", "member", str(member_id), f"Deleted member: {member.name}")
    await db.delete(member)
    await db.commit()


@router.post("/{member_id}/sample-photos", response_model=SamplePhotoResponse, status_code=status.HTTP_201_CREATED)
async def add_member_sample_photo(
    member_id: int,
    body: SamplePhotoCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

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


@router.delete("/{member_id}/sample-photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member_sample_photo(
    member_id: int,
    photo_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    photo = next((sp for sp in member.sample_photos if sp.id == photo_id), None)
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    delete_uploaded_image(photo.src_url)
    await db.delete(photo)
    await db.commit()


@router.patch("/{member_id}/sample-photos", status_code=status.HTTP_200_OK)
async def update_member_sample_photo_captions(
    member_id: int,
    body: list[SamplePhotoCaptionUpdate],
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Member).where(Member.id == member_id))
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
