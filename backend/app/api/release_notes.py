import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.release_note import ReleaseNote
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.release_note import (
    ReleaseNoteCreate,
    ReleaseNoteResponse,
    ReleaseNoteUpdate,
)
from ..services.markdown_service import render_markdown
from .activity import log_activity
from .deps import get_db, require_admin

router = APIRouter()


def _render_md(body_md: str) -> str:
    return render_markdown(body_md)


def _to_response(rn: ReleaseNote) -> ReleaseNoteResponse:
    return ReleaseNoteResponse(
        id=rn.id,
        version=rn.version,
        date=rn.date,
        html=rn.html,
        body_md=rn.body_md,
        is_published=rn.is_published,
    )


def _duplicate_version_error(version: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f'A release note with version "{version}" already exists',
    )


# Newest-first: by release date, then by id so same-date releases stay
# deterministically ordered (most recently created first) and double-digit
# version components never hit string-sort pitfalls.
_ORDER_BY = (ReleaseNote.date.desc(), ReleaseNote.id.desc())


@router.get("", response_model=PaginatedResponse[ReleaseNoteResponse])
async def list_release_notes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Public list — published release notes only, newest first."""
    count_result = await db.execute(
        select(func.count()).select_from(ReleaseNote).where(ReleaseNote.is_published.is_(True))
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(ReleaseNote)
        .where(ReleaseNote.is_published.is_(True))
        .order_by(*_ORDER_BY)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    notes = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(n) for n in notes],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/admin", response_model=PaginatedResponse[ReleaseNoteResponse])
async def list_release_notes_admin(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin list — all release notes (published + drafts), newest first."""
    count_result = await db.execute(select(func.count()).select_from(ReleaseNote))
    total = count_result.scalar_one()

    result = await db.execute(
        select(ReleaseNote)
        .order_by(*_ORDER_BY)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    notes = result.scalars().all()

    return PaginatedResponse(
        items=[_to_response(n) for n in notes],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.post("", response_model=ReleaseNoteResponse, status_code=status.HTTP_201_CREATED)
async def create_release_note(
    body: ReleaseNoteCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    # Friendly pre-check for the common case; the unique constraint (caught
    # below) is the race-proof backstop.
    existing = await db.execute(select(ReleaseNote).where(ReleaseNote.version == body.version))
    if existing.scalar_one_or_none() is not None:
        raise _duplicate_version_error(body.version)

    rn = ReleaseNote(
        version=body.version,
        date=body.date,
        body_md=body.body_md,
        html=_render_md(body.body_md),
        is_published=body.is_published,
    )
    db.add(rn)
    try:
        await db.flush()  # assigns rn.id and surfaces a unique-version collision
    except IntegrityError:
        await db.rollback()
        raise _duplicate_version_error(body.version)

    await log_activity(
        db, admin, "create", "release_note", str(rn.id),
        f"Created release note: {rn.version}",
    )
    await db.commit()
    await db.refresh(rn)
    return _to_response(rn)


@router.put("/{release_note_id}", response_model=ReleaseNoteResponse)
async def update_release_note(
    release_note_id: int,
    body: ReleaseNoteUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReleaseNote).where(ReleaseNote.id == release_note_id))
    rn = result.scalar_one_or_none()
    if rn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release note not found")

    if body.version is not None and body.version != rn.version:
        dup = await db.execute(
            select(ReleaseNote).where(
                ReleaseNote.version == body.version,
                ReleaseNote.id != rn.id,
            )
        )
        if dup.scalar_one_or_none() is not None:
            raise _duplicate_version_error(body.version)
        rn.version = body.version
    if body.date is not None:
        rn.date = body.date
    if body.body_md is not None:
        rn.body_md = body.body_md
        rn.html = _render_md(body.body_md)
    if body.is_published is not None:
        rn.is_published = body.is_published

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise _duplicate_version_error(body.version or rn.version)
    await db.refresh(rn)
    return _to_response(rn)


@router.patch("/{release_note_id}", response_model=ReleaseNoteResponse)
async def toggle_release_note_published(
    release_note_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Flip a release note's published/draft state."""
    result = await db.execute(select(ReleaseNote).where(ReleaseNote.id == release_note_id))
    rn = result.scalar_one_or_none()
    if rn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release note not found")
    rn.is_published = not rn.is_published
    await db.commit()
    await db.refresh(rn)
    return _to_response(rn)


@router.delete("/{release_note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_release_note(
    release_note_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReleaseNote).where(ReleaseNote.id == release_note_id))
    rn = result.scalar_one_or_none()
    if rn is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Release note not found")
    version = rn.version
    await log_activity(
        db, admin, "delete", "release_note", str(rn.id),
        f"Deleted release note: {version}",
    )
    await db.delete(rn)
    await db.commit()
