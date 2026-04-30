import io
import math
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from PIL import Image
from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.gallery import GalleryPhoto
from ..models.gallery_comment import GalleryPhotoComment
from ..models.gallery_like import GalleryPhotoLike
from ..models.member import Member
from ..models.notification import (
    NOTIFICATION_TYPE_GALLERY_COMMENT,
    NOTIFICATION_TYPE_GALLERY_LIKE,
    Notification,
)
from ..models.user import User
from ..rate_limit import limiter, AUTH_ATTEMPT, SOCIAL_ACTION
from ..schemas.common import PaginatedResponse
from ..schemas.gallery import (
    GalleryPhotoResponse,
    GalleryPhotoUpdate,
    PhotoExifSchema,
)
from ..schemas.gallery_comment import (
    GalleryCommentCreate,
    GalleryCommentResponse,
    GalleryCommentUpdate,
)
from ..services.storage import delete_uploaded_image, save_gallery_image, make_user_slug
from .activity import log_activity
from .deps import get_current_user, get_current_user_optional, get_db, require_admin

ALLOWED_CONTENT_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/heic", "image/heif",
}

# Content types that browsers may report for HEIC when the OS doesn't register
# a proper MIME type (common on Windows without HEIF Image Extensions).
_HEIC_FALLBACK_TYPES = {"application/octet-stream", ""}

# Body must be considered "edited" only if updated_at is meaningfully later than created_at
EDIT_THRESHOLD = timedelta(seconds=60)


def _has_valid_magic_bytes(content: bytes) -> bool:
    """Check whether raw bytes start with a known image signature."""
    if content[:3] == b'\xff\xd8\xff':  # JPEG
        return True
    if content[:8] == b'\x89PNG\r\n\x1a\n':  # PNG
        return True
    if content[:6] in (b'GIF87a', b'GIF89a'):  # GIF
        return True
    if content[:4] == b'RIFF' and len(content) >= 12 and content[8:12] == b'WEBP':  # WebP
        return True
    # HEIC/HEIF (ISOBMFF container): bytes 4-8 are 'ftyp'
    if len(content) >= 12 and content[4:8] == b'ftyp':
        return True
    return False


async def validate_image_upload(file: UploadFile) -> bytes:
    """Validate an uploaded image: content type, magic bytes, file size. Returns validated bytes."""
    ct = file.content_type or ""
    if ct not in ALLOWED_CONTENT_TYPES and ct not in _HEIC_FALLBACK_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, GIF, WebP, or HEIC)",
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB",
        )

    if not _has_valid_magic_bytes(content):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid image (magic bytes check failed)",
        )

    # Validate parseable image with Pillow (pillow-heif registered at startup)
    try:
        img = Image.open(io.BytesIO(content))
        img.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid image",
        )

    # Seek back so downstream can read the file
    await file.seek(0)
    return content

router = APIRouter()


# --- Helpers ---


def _photo_to_response(
    photo: GalleryPhoto,
    *,
    like_count: int = 0,
    comment_count: int = 0,
    viewer_has_liked: bool | None = None,
) -> GalleryPhotoResponse:
    exif = None
    if any([photo.exif_camera, photo.exif_focal_length, photo.exif_iso, photo.exif_aperture, photo.exif_shutter_speed]):
        exif = PhotoExifSchema(
            camera=photo.exif_camera,
            focal_length=photo.exif_focal_length,
            iso=photo.exif_iso,
            aperture=photo.exif_aperture,
            shutter_speed=photo.exif_shutter_speed,
        )
    return GalleryPhotoResponse(
        id=photo.id,
        url=photo.url,
        title=photo.title,
        photographer=photo.photographer,
        exif=exif,
        visible=photo.visible,
        contest_id=photo.contest_id,
        contest_submission_id=photo.contest_submission_id,
        is_winner=photo.is_winner,
        winner_place=photo.winner_place,
        winner_category=photo.winner_category,
        winner_placements=photo.winner_placements,
        like_count=like_count,
        comment_count=comment_count,
        viewer_has_liked=viewer_has_liked,
    )


async def _batch_like_counts(photo_ids: list[int], db: AsyncSession) -> dict[int, int]:
    if not photo_ids:
        return {}
    result = await db.execute(
        select(GalleryPhotoLike.photo_id, func.count().label("cnt"))
        .where(GalleryPhotoLike.photo_id.in_(photo_ids))
        .group_by(GalleryPhotoLike.photo_id)
    )
    return {row.photo_id: row.cnt for row in result}


async def _batch_comment_counts(photo_ids: list[int], db: AsyncSession) -> dict[int, int]:
    if not photo_ids:
        return {}
    result = await db.execute(
        select(GalleryPhotoComment.photo_id, func.count().label("cnt"))
        .where(GalleryPhotoComment.photo_id.in_(photo_ids))
        .group_by(GalleryPhotoComment.photo_id)
    )
    return {row.photo_id: row.cnt for row in result}


async def _batch_viewer_likes(photo_ids: list[int], user_id: uuid.UUID, db: AsyncSession) -> set[int]:
    if not photo_ids:
        return set()
    result = await db.execute(
        select(GalleryPhotoLike.photo_id)
        .where(GalleryPhotoLike.photo_id.in_(photo_ids))
        .where(GalleryPhotoLike.user_id == user_id)
    )
    return {row[0] for row in result}


async def _build_photo_responses(
    photos: list[GalleryPhoto],
    db: AsyncSession,
    user: User | None,
) -> list[GalleryPhotoResponse]:
    photo_ids = [p.id for p in photos]
    like_counts = await _batch_like_counts(photo_ids, db)
    comment_counts = await _batch_comment_counts(photo_ids, db)
    viewer_likes = (
        await _batch_viewer_likes(photo_ids, user.id, db) if user else set()
    )
    return [
        _photo_to_response(
            p,
            like_count=like_counts.get(p.id, 0),
            comment_count=comment_counts.get(p.id, 0),
            viewer_has_liked=(p.id in viewer_likes) if user else None,
        )
        for p in photos
    ]


async def _photo_owner_user_id(photo: GalleryPhoto, db: AsyncSession) -> uuid.UUID | None:
    """Return the user_id of the photo's owner via member, if linked."""
    if photo.member_id is None:
        return None
    result = await db.execute(select(Member.user_id).where(Member.id == photo.member_id))
    row = result.first()
    if row is None:
        return None
    return row[0]


async def auto_like_photo_owner(
    photo: GalleryPhoto,
    db: AsyncSession,
    *,
    owner_user_id: uuid.UUID | None = None,
) -> None:
    """Insert a self-like for the photo's owner (Reddit-style implicit endorsement).

    Idempotent: ON CONFLICT DO NOTHING handles the case where a like already
    exists. Skips silently if the photo has no resolvable owner (no member_id,
    or the linked member has no user_id). The existing self-actor filter on
    the like_photo notification path means no notification fires either way —
    this helper does not touch notifications.

    Pass `owner_user_id` explicitly to skip the Member lookup when the caller
    already knows it (e.g., contest gallery population).
    """
    if owner_user_id is None:
        owner_user_id = await _photo_owner_user_id(photo, db)
    if owner_user_id is None:
        return
    stmt = pg_insert(GalleryPhotoLike).values(
        photo_id=photo.id, user_id=owner_user_id
    ).on_conflict_do_nothing(index_elements=["photo_id", "user_id"])
    await db.execute(stmt)


_GALLERY_NOTIFICATION_TYPES = (
    NOTIFICATION_TYPE_GALLERY_LIKE,
    NOTIFICATION_TYPE_GALLERY_COMMENT,
)


async def _delete_notifications_for_photo(photo_id: int, db: AsyncSession) -> None:
    """Remove like/comment notifications whose payload references the deleted photo."""
    await db.execute(
        sql_delete(Notification).where(
            Notification.type.in_(_GALLERY_NOTIFICATION_TYPES),
            Notification.payload["photoId"].astext == str(photo_id),
        )
    )


async def _delete_notifications_for_comment(comment_id: int, db: AsyncSession) -> None:
    """Remove the comment notification whose payload references the deleted comment."""
    await db.execute(
        sql_delete(Notification).where(
            Notification.type == NOTIFICATION_TYPE_GALLERY_COMMENT,
            Notification.payload["commentId"].astext == str(comment_id),
        )
    )


async def _delete_like_notification(
    photo_id: int, recipient_user_id: uuid.UUID, actor_user_id: uuid.UUID, db: AsyncSession
) -> None:
    """Remove the like notification corresponding to a single (photo, actor, recipient)."""
    await db.execute(
        sql_delete(Notification).where(
            Notification.type == NOTIFICATION_TYPE_GALLERY_LIKE,
            Notification.user_id == recipient_user_id,
            Notification.payload["photoId"].astext == str(photo_id),
            Notification.payload["actorUserId"].astext == str(actor_user_id),
        )
    )


# --- Listing / fetch (extended with counts + viewer_has_liked) ---


@router.get("", response_model=PaginatedResponse[GalleryPhotoResponse])
async def list_gallery(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    winners_only: bool = Query(True),
    include_hidden: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    query = select(GalleryPhoto)

    if not include_hidden:
        query = query.where(GalleryPhoto.visible == True)  # noqa: E712

    if winners_only:
        query = query.where(GalleryPhoto.is_winner == True)  # noqa: E712

    count_query = select(func.count()).select_from(query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    result = await db.execute(
        query.order_by(GalleryPhoto.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    photos = result.scalars().all()

    items = await _build_photo_responses(list(photos), db, user)

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{photo_id}", response_model=GalleryPhotoResponse)
async def get_gallery_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    items = await _build_photo_responses([photo], db, user)
    return items[0]


# --- Admin: upload / create / update / delete ---


@router.post("/upload", response_model=GalleryPhotoResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_ATTEMPT)
async def upload_gallery_photo(
    request: Request,
    file: UploadFile,
    title: str = Form(...),
    photographer: str = Form(...),
    member_id: int | None = Form(None),
    exif_camera: str | None = Form(None),
    exif_focal_length: str | None = Form(None),
    exif_aperture: str | None = Form(None),
    exif_shutter_speed: str | None = Form(None),
    exif_iso: int | None = Form(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    await validate_image_upload(file)
    slug = make_user_slug(admin.id, admin.first_name, admin.last_name)
    url = await save_gallery_image(file, user_slug=slug)
    photo = GalleryPhoto(
        url=url,
        title=title,
        photographer=photographer,
        member_id=member_id,
        exif_camera=exif_camera,
        exif_focal_length=exif_focal_length,
        exif_iso=exif_iso,
        exif_aperture=exif_aperture,
        exif_shutter_speed=exif_shutter_speed,
    )
    db.add(photo)
    await db.flush()  # populate photo.id for the auto-like below
    await auto_like_photo_owner(photo, db)
    await log_activity(db, admin, "upload", "gallery", title, f"Uploaded gallery photo: {title}")
    await db.commit()
    await db.refresh(photo)
    items = await _build_photo_responses([photo], db, admin)
    return items[0]


@router.post("", response_model=GalleryPhotoResponse, status_code=status.HTTP_201_CREATED)
async def create_gallery_photo(
    body: GalleryPhotoUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if not body.url or not body.title or not body.photographer:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="url, title, and photographer are required")
    photo = GalleryPhoto(
        url=body.url,
        title=body.title,
        photographer=body.photographer,
        member_id=body.member_id,
    )
    if body.exif:
        photo.exif_camera = body.exif.camera
        photo.exif_focal_length = body.exif.focal_length
        photo.exif_iso = body.exif.iso
        photo.exif_aperture = body.exif.aperture
        photo.exif_shutter_speed = body.exif.shutter_speed
    db.add(photo)
    await db.flush()  # populate photo.id for the auto-like below
    await auto_like_photo_owner(photo, db)
    await log_activity(db, admin, "create", "gallery", body.title, f"Created gallery photo: {body.title}")
    await db.commit()
    await db.refresh(photo)
    items = await _build_photo_responses([photo], db, admin)
    return items[0]


@router.put("/{photo_id}", response_model=GalleryPhotoResponse)
async def update_gallery_photo(
    photo_id: int,
    body: GalleryPhotoUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    if body.url is not None and body.url != photo.url:
        delete_uploaded_image(photo.url)
        photo.url = body.url
    if body.title is not None:
        photo.title = body.title
    if body.photographer is not None:
        photo.photographer = body.photographer
    if body.member_id is not None:
        photo.member_id = body.member_id
    if body.exif is not None:
        photo.exif_camera = body.exif.camera
        photo.exif_focal_length = body.exif.focal_length
        photo.exif_iso = body.exif.iso
        photo.exif_aperture = body.exif.aperture
        photo.exif_shutter_speed = body.exif.shutter_speed
    if body.visible is not None:
        photo.visible = body.visible
    await db.commit()
    await db.refresh(photo)
    items = await _build_photo_responses([photo], db, None)
    return items[0]


@router.patch("/{photo_id}/visibility", response_model=GalleryPhotoResponse)
async def toggle_gallery_visibility(
    photo_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    photo.visible = not photo.visible
    await db.commit()
    await db.refresh(photo)
    items = await _build_photo_responses([photo], db, None)
    return items[0]


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_gallery_photo(
    photo_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    delete_uploaded_image(photo.url)
    await log_activity(db, admin, "delete", "gallery", str(photo_id), f"Deleted gallery photo: {photo.title}")
    await _delete_notifications_for_photo(photo_id, db)
    await db.delete(photo)
    await db.commit()


# --- Likes ---


@router.get("/{photo_id}/likes/count")
async def get_photo_likes_count(photo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count())
        .select_from(GalleryPhotoLike)
        .where(GalleryPhotoLike.photo_id == photo_id)
    )
    return {"count": result.scalar_one()}


@router.post("/{photo_id}/like", status_code=status.HTTP_201_CREATED)
@limiter.limit(SOCIAL_ACTION)
async def like_photo(
    request: Request,
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify photo exists
    photo_result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = photo_result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    # Idempotent insert: ON CONFLICT DO NOTHING (PostgreSQL)
    stmt = pg_insert(GalleryPhotoLike).values(
        photo_id=photo_id, user_id=user.id
    ).on_conflict_do_nothing(
        index_elements=["photo_id", "user_id"]
    ).returning(GalleryPhotoLike.id)
    insert_result = await db.execute(stmt)
    inserted_row = insert_result.first()
    is_new = inserted_row is not None

    # Notification: only if newly inserted (not duplicate), and recipient != actor
    if is_new:
        owner_user_id = await _photo_owner_user_id(photo, db)
        if owner_user_id is not None and owner_user_id != user.id:
            actor_name = f"{user.first_name} {user.last_name}".strip() or user.email
            db.add(Notification(
                user_id=owner_user_id,
                type=NOTIFICATION_TYPE_GALLERY_LIKE,
                payload={
                    "photoId": photo.id,
                    "photoTitle": photo.title,
                    "photoUrl": photo.url,
                    "actorUserId": str(user.id),
                    "actorName": actor_name,
                },
            ))

    await db.commit()
    return {"liked": True}


@router.delete("/{photo_id}/like", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(SOCIAL_ACTION)
async def unlike_photo(
    request: Request,
    photo_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Idempotent: delete if exists, no error if not
    result = await db.execute(
        select(GalleryPhotoLike).where(
            GalleryPhotoLike.photo_id == photo_id,
            GalleryPhotoLike.user_id == user.id,
        )
    )
    like_row = result.scalar_one_or_none()
    if like_row is not None:
        await db.delete(like_row)
        # Also remove the corresponding like notification so the photo owner doesn't
        # see a phantom "X liked your photo" entry after the like has been retracted.
        photo_result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
        photo = photo_result.scalar_one_or_none()
        if photo is not None:
            owner_user_id = await _photo_owner_user_id(photo, db)
            if owner_user_id is not None and owner_user_id != user.id:
                await _delete_like_notification(photo_id, owner_user_id, user.id, db)
        await db.commit()


# --- Comments ---


def _comment_to_response(
    comment: GalleryPhotoComment,
    *,
    author_name: str | None,
    author_avatar: str | None,
    viewer_user_id: uuid.UUID | None,
) -> GalleryCommentResponse:
    edited = (comment.updated_at - comment.created_at) > EDIT_THRESHOLD
    return GalleryCommentResponse(
        id=comment.id,
        photo_id=comment.photo_id,
        user_id=str(comment.user_id) if comment.user_id else None,
        author_name=author_name,
        author_avatar=author_avatar,
        body=comment.body,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
        edited=edited,
        is_own=(viewer_user_id is not None and comment.user_id == viewer_user_id),
    )


async def _resolve_comment_authors(
    comments: list[GalleryPhotoComment],
    db: AsyncSession,
) -> dict[uuid.UUID, tuple[str, str | None]]:
    """For comments with non-null user_id, fetch (name, avatar) keyed by user_id."""
    user_ids = {c.user_id for c in comments if c.user_id is not None}
    if not user_ids:
        return {}
    # Fetch members linked to these users
    member_result = await db.execute(
        select(Member.user_id, Member.name, Member.avatar_url).where(Member.user_id.in_(user_ids))
    )
    by_uid: dict[uuid.UUID, tuple[str, str | None]] = {}
    for row in member_result:
        avatar = row.avatar_url if row.avatar_url and row.avatar_url != "DEFAULT" else None
        by_uid[row.user_id] = (row.name, avatar)
    # Fall back to user first/last name for users without a member record
    missing = user_ids - set(by_uid.keys())
    if missing:
        user_result = await db.execute(
            select(User.id, User.first_name, User.last_name).where(User.id.in_(missing))
        )
        for row in user_result:
            display = f"{row.first_name} {row.last_name}".strip() or "Member"
            by_uid[row.id] = (display, None)
    return by_uid


@router.get("/{photo_id}/comments", response_model=PaginatedResponse[GalleryCommentResponse])
async def list_photo_comments(
    photo_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    count_result = await db.execute(
        select(func.count()).select_from(GalleryPhotoComment).where(
            GalleryPhotoComment.photo_id == photo_id
        )
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(GalleryPhotoComment)
        .where(GalleryPhotoComment.photo_id == photo_id)
        .order_by(GalleryPhotoComment.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    comments = list(result.scalars().all())
    authors = await _resolve_comment_authors(comments, db)

    viewer_id = user.id if user else None
    items: list[GalleryCommentResponse] = []
    for c in comments:
        if c.user_id and c.user_id in authors:
            name, avatar = authors[c.user_id]
        else:
            name, avatar = None, None
        items.append(_comment_to_response(
            c,
            author_name=name,
            author_avatar=avatar,
            viewer_user_id=viewer_id,
        ))

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.post("/{photo_id}/comments", response_model=GalleryCommentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_ATTEMPT)
async def post_photo_comment(
    request: Request,
    photo_id: int,
    body: GalleryCommentCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photo_result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = photo_result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")

    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment cannot be empty")

    comment = GalleryPhotoComment(
        photo_id=photo_id,
        user_id=user.id,
        body=text,
    )
    db.add(comment)
    await db.flush()  # populate comment.id

    # Notification to photo owner if owner != actor
    owner_user_id = await _photo_owner_user_id(photo, db)
    if owner_user_id is not None and owner_user_id != user.id:
        actor_name = f"{user.first_name} {user.last_name}".strip() or user.email
        body_preview = text[:140]
        db.add(Notification(
            user_id=owner_user_id,
            type=NOTIFICATION_TYPE_GALLERY_COMMENT,
            payload={
                "photoId": photo.id,
                "photoTitle": photo.title,
                "photoUrl": photo.url,
                "commentId": comment.id,
                "bodyPreview": body_preview,
                "actorUserId": str(user.id),
                "actorName": actor_name,
            },
        ))

    await db.commit()
    await db.refresh(comment)

    authors = await _resolve_comment_authors([comment], db)
    name, avatar = authors.get(user.id, (None, None))
    return _comment_to_response(
        comment,
        author_name=name,
        author_avatar=avatar,
        viewer_user_id=user.id,
    )


@router.patch("/comments/{comment_id}", response_model=GalleryCommentResponse)
@limiter.limit(AUTH_ATTEMPT)
async def edit_photo_comment(
    request: Request,
    comment_id: int,
    body: GalleryCommentUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GalleryPhotoComment).where(GalleryPhotoComment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    is_admin = user.role == "admin"
    is_owner = comment.user_id == user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit another user's comment")

    text = body.body.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comment cannot be empty")

    if text != comment.body:
        comment.body = text
        # SQLAlchemy onupdate fires automatically when the row is updated
        await db.commit()
        await db.refresh(comment)

    authors = await _resolve_comment_authors([comment], db)
    name, avatar = (None, None)
    if comment.user_id and comment.user_id in authors:
        name, avatar = authors[comment.user_id]
    return _comment_to_response(
        comment,
        author_name=name,
        author_avatar=avatar,
        viewer_user_id=user.id,
    )


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(AUTH_ATTEMPT)
async def delete_photo_comment(
    request: Request,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GalleryPhotoComment).where(GalleryPhotoComment.id == comment_id)
    )
    comment = result.scalar_one_or_none()
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comment not found")
    is_admin = user.role == "admin"
    is_owner = comment.user_id == user.id
    if not (is_admin or is_owner):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete another user's comment")
    await _delete_notifications_for_comment(comment.id, db)
    await db.delete(comment)
    await db.commit()
