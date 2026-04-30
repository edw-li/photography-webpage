import logging
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.announcement import (
    AUDIENCE_ADMIN,
    AUDIENCE_AUTHENTICATED,
    AUDIENCE_PUBLIC,
    AUDIENCE_VALUES,
    SEVERITY_VALUES,
    Announcement,
    AnnouncementDismissal,
)
from ..models.user import User
from ..schemas.announcement import (
    ActiveAnnouncementResponse,
    AnnouncementCreate,
    AnnouncementResponse,
    AnnouncementUpdate,
)
from ..schemas.common import PaginatedResponse
from ..services.markdown_service import (
    ANNOUNCEMENT_ALLOWED_ATTRS,
    ANNOUNCEMENT_ALLOWED_TAGS,
    render_markdown,
)
from .activity import log_activity
from .deps import get_current_user, get_current_user_optional, get_db, require_admin

logger = logging.getLogger(__name__)

router = APIRouter()


def _render_body(body_md: str) -> str:
    return render_markdown(
        body_md,
        allowed_tags=ANNOUNCEMENT_ALLOWED_TAGS,
        allowed_attrs=ANNOUNCEMENT_ALLOWED_ATTRS,
    )


def _to_response(a: Announcement, dismissal_count: int = 0) -> AnnouncementResponse:
    return AnnouncementResponse(
        id=a.id,
        title=a.title,
        body_md=a.body_md,
        html=a.html,
        severity=a.severity,  # type: ignore[arg-type]
        audience=a.audience,  # type: ignore[arg-type]
        priority=a.priority,
        is_dismissable=a.is_dismissable,
        cta_label=a.cta_label,
        cta_url=a.cta_url,
        starts_at=a.starts_at,
        ends_at=a.ends_at,
        is_active=a.is_active,
        created_by=a.created_by,
        created_at=a.created_at,
        updated_at=a.updated_at,
        dismissal_count=dismissal_count,
    )


def _to_active_response(a: Announcement) -> ActiveAnnouncementResponse:
    return ActiveAnnouncementResponse(
        id=a.id,
        title=a.title,
        html=a.html,
        severity=a.severity,  # type: ignore[arg-type]
        is_dismissable=a.is_dismissable,
        cta_label=a.cta_label,
        cta_url=a.cta_url,
    )


def _allowed_audiences_for(user: User | None) -> list[str]:
    if user is None:
        return [AUDIENCE_PUBLIC]
    if user.role == "admin":
        return [AUDIENCE_PUBLIC, AUDIENCE_AUTHENTICATED, AUDIENCE_ADMIN]
    return [AUDIENCE_PUBLIC, AUDIENCE_AUTHENTICATED]


# -- Public endpoints --


@router.get("/active", response_model=ActiveAnnouncementResponse | None)
async def get_active_announcement(
    user: User | None = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_db),
):
    """Return the single highest-priority displayable announcement for the viewer.

    Returns null if none match. Anonymous viewers can only see public banners and
    must filter their own dismissals via localStorage. Authenticated viewers have
    server-side dismissal filtering applied.
    """
    now = datetime.now(timezone.utc)
    audiences = _allowed_audiences_for(user)

    severity_rank = case(
        (Announcement.severity == "critical", 2),
        (Announcement.severity == "warning", 1),
        (Announcement.severity == "info", 0),
        else_=0,
    )

    stmt = (
        select(Announcement)
        .where(
            Announcement.is_active.is_(True),
            Announcement.audience.in_(audiences),
            or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now),
            or_(Announcement.ends_at.is_(None), Announcement.ends_at > now),
        )
        .order_by(
            Announcement.priority.desc(),
            severity_rank.desc(),
            Announcement.created_at.desc(),
        )
    )

    if user is not None:
        # Exclude announcements this user has dismissed — but ONLY for dismissable
        # ones. A non-dismissable banner (admin's "force visibility" toggle) must
        # show even if the user previously dismissed it back when it was dismissable.
        dismissed_subq = (
            select(AnnouncementDismissal.announcement_id)
            .where(AnnouncementDismissal.user_id == user.id)
            .scalar_subquery()
        )
        stmt = stmt.where(
            or_(
                Announcement.is_dismissable.is_(False),
                Announcement.id.not_in(dismissed_subq),
            )
        )

    result = await db.execute(stmt.limit(1))
    a = result.scalar_one_or_none()
    if a is None:
        return None
    return _to_active_response(a)


@router.post("/{announcement_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
async def dismiss_announcement(
    announcement_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Mark an announcement as dismissed for the current user. Idempotent."""
    # Fetch the row so we can verify audience match — without this, a non-admin
    # could dismiss admin-only banners they couldn't see, polluting analytics
    # and leaking IDs via 204-vs-404 probing.
    result = await db.execute(
        select(Announcement.audience).where(Announcement.id == announcement_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )
    if row[0] not in _allowed_audiences_for(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to dismiss this announcement",
        )

    # ON CONFLICT DO NOTHING: idempotent across concurrent dismisses (e.g., multiple tabs).
    await db.execute(
        pg_insert(AnnouncementDismissal)
        .values(announcement_id=announcement_id, user_id=user.id)
        .on_conflict_do_nothing(index_elements=["announcement_id", "user_id"])
    )
    await db.commit()


# -- Admin endpoints --


@router.get("", response_model=PaginatedResponse[AnnouncementResponse])
async def list_announcements(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    audience: str | None = Query(None),
    severity: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all announcements (any state) with optional filters."""
    if audience is not None and audience not in AUDIENCE_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid audience filter"
        )
    if severity is not None and severity not in SEVERITY_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity filter"
        )

    base = select(Announcement)
    count_q = select(func.count()).select_from(Announcement)

    if audience is not None:
        base = base.where(Announcement.audience == audience)
        count_q = count_q.where(Announcement.audience == audience)
    if severity is not None:
        base = base.where(Announcement.severity == severity)
        count_q = count_q.where(Announcement.severity == severity)

    now = datetime.now(timezone.utc)
    if status_filter == "active":
        cond = (
            (Announcement.is_active.is_(True))
            & (or_(Announcement.starts_at.is_(None), Announcement.starts_at <= now))
            & (or_(Announcement.ends_at.is_(None), Announcement.ends_at > now))
        )
        base = base.where(cond)
        count_q = count_q.where(cond)
    elif status_filter == "scheduled":
        cond = (Announcement.is_active.is_(True)) & (
            Announcement.starts_at.isnot(None)
        ) & (Announcement.starts_at > now)
        base = base.where(cond)
        count_q = count_q.where(cond)
    elif status_filter == "ended":
        # Match the frontend's deriveStatus: "inactive" (admin-disabled) supersedes
        # "ended". A row that's both inactive AND past its end is classified as
        # inactive in the UI; filtering by 'ended' should not surface it here.
        cond = (
            Announcement.is_active.is_(True)
            & Announcement.ends_at.isnot(None)
            & (Announcement.ends_at <= now)
        )
        base = base.where(cond)
        count_q = count_q.where(cond)
    elif status_filter == "inactive":
        base = base.where(Announcement.is_active.is_(False))
        count_q = count_q.where(Announcement.is_active.is_(False))
    elif status_filter is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid status filter (active|scheduled|ended|inactive)",
        )

    total = (await db.execute(count_q)).scalar_one()

    result = await db.execute(
        base.order_by(Announcement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = result.scalars().all()

    if not rows:
        return PaginatedResponse(
            items=[],
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total > 0 else 0,
        )

    # Single GROUP BY to attach dismissal counts per announcement.
    counts_result = await db.execute(
        select(
            AnnouncementDismissal.announcement_id,
            func.count(AnnouncementDismissal.id),
        )
        .where(AnnouncementDismissal.announcement_id.in_([r.id for r in rows]))
        .group_by(AnnouncementDismissal.announcement_id)
    )
    counts_map = {row[0]: row[1] for row in counts_result.all()}

    return PaginatedResponse(
        items=[_to_response(a, counts_map.get(a.id, 0)) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(
    announcement_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )
    count_result = await db.execute(
        select(func.count())
        .select_from(AnnouncementDismissal)
        .where(AnnouncementDismissal.announcement_id == announcement_id)
    )
    return _to_response(a, count_result.scalar_one())


@router.post(
    "", response_model=AnnouncementResponse, status_code=status.HTTP_201_CREATED
)
async def create_announcement(
    body: AnnouncementCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(
        select(Announcement.id).where(Announcement.id == body.id)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Announcement with id '{body.id}' already exists",
        )

    a = Announcement(
        id=body.id,
        title=body.title,
        body_md=body.body_md,
        html=_render_body(body.body_md),
        severity=body.severity,
        audience=body.audience,
        priority=body.priority,
        is_dismissable=body.is_dismissable,
        cta_label=body.cta_label,
        cta_url=body.cta_url,
        starts_at=body.starts_at,
        ends_at=body.ends_at,
        is_active=body.is_active,
        created_by=admin.id,
    )
    db.add(a)
    await log_activity(
        db, admin, "create", "announcement", body.id, f"Created announcement: {body.title}"
    )
    await db.commit()
    await db.refresh(a)
    return _to_response(a, 0)


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: str,
    body: AnnouncementUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )

    # Apply patches; track whether body_md changed so we re-render.
    data = body.model_dump(exclude_unset=True, by_alias=False)

    # Guard against explicit null on non-nullable columns (Pydantic accepts
    # `null` for `T | None` fields, but the DB constraint would fail).
    non_nullable_camel = {
        "title": "title",
        "body_md": "bodyMd",
        "severity": "severity",
        "audience": "audience",
        "priority": "priority",
        "is_dismissable": "isDismissable",
        "is_active": "isActive",
    }
    for snake, camel in non_nullable_camel.items():
        if snake in data and data[snake] is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{camel} cannot be null",
            )

    # Cross-field schedule sanity (after patch, against effective values).
    new_starts = data.get("starts_at", a.starts_at)
    new_ends = data.get("ends_at", a.ends_at)
    if new_starts is not None and new_ends is not None and new_ends <= new_starts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="endsAt must be after startsAt",
        )

    new_cta_label = data.get("cta_label", a.cta_label)
    new_cta_url = data.get("cta_url", a.cta_url)
    if (new_cta_label is None) != (new_cta_url is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ctaLabel and ctaUrl must both be provided or both be empty",
        )

    if "severity" in data and data["severity"] not in SEVERITY_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid severity"
        )
    if "audience" in data and data["audience"] not in AUDIENCE_VALUES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid audience"
        )

    for field, value in data.items():
        setattr(a, field, value)
    if "body_md" in data:
        a.html = _render_body(a.body_md)

    await log_activity(
        db, admin, "update", "announcement", a.id, f"Updated announcement: {a.title}"
    )
    await db.commit()
    await db.refresh(a)

    count_result = await db.execute(
        select(func.count())
        .select_from(AnnouncementDismissal)
        .where(AnnouncementDismissal.announcement_id == a.id)
    )
    return _to_response(a, count_result.scalar_one())


@router.patch("/{announcement_id}/active", response_model=AnnouncementResponse)
async def toggle_announcement_active(
    announcement_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )
    a.is_active = not a.is_active
    await log_activity(
        db,
        admin,
        "update",
        "announcement",
        a.id,
        f"{'Activated' if a.is_active else 'Deactivated'} announcement: {a.title}",
    )
    await db.commit()
    await db.refresh(a)
    count_result = await db.execute(
        select(func.count())
        .select_from(AnnouncementDismissal)
        .where(AnnouncementDismissal.announcement_id == a.id)
    )
    return _to_response(a, count_result.scalar_one())


@router.post(
    "/{announcement_id}/reset-dismissals", status_code=status.HTTP_204_NO_CONTENT
)
async def reset_announcement_dismissals(
    announcement_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )
    deleted = await db.execute(
        delete(AnnouncementDismissal).where(
            AnnouncementDismissal.announcement_id == announcement_id
        )
    )
    # Touch updated_at so the admin list reflects the most recent admin action
    # on this row, even though no announcement column was directly mutated.
    a.updated_at = datetime.now(timezone.utc)
    await log_activity(
        db,
        admin,
        "update",
        "announcement",
        a.id,
        f"Reset {deleted.rowcount or 0} dismissal(s) for announcement: {a.title}",
    )
    await db.commit()


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: str,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    a = result.scalar_one_or_none()
    if a is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found"
        )
    title = a.title
    await db.delete(a)
    await log_activity(
        db, admin, "delete", "announcement", announcement_id, f"Deleted announcement: {title}"
    )
    await db.commit()
