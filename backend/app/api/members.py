import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.member import Member, SamplePhoto, SocialLink
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.member import MemberCreate, MemberResponse, MemberUpdate
from .activity import log_activity
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
        member.avatar_url = body.avatar
    if body.photography_type is not None:
        member.photography_type = body.photography_type
    if body.leadership_role is not None:
        member.leadership_role = body.leadership_role
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
    await log_activity(db, admin, "delete", "member", str(member_id), f"Deleted member: {member.name}")
    await db.delete(member)
    await db.commit()
