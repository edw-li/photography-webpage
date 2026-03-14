import io
import math

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models.gallery import GalleryPhoto
from ..models.user import User
from ..rate_limit import limiter, AUTH_ATTEMPT
from ..schemas.common import PaginatedResponse
from ..schemas.gallery import (
    GalleryPhotoResponse,
    GalleryPhotoUpdate,
    PhotoExifSchema,
)
from ..services.storage import delete_uploaded_image, save_gallery_image, make_user_slug
from .activity import log_activity
from .deps import get_db, require_admin

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


async def validate_image_upload(file: UploadFile) -> bytes:
    """Validate an uploaded image: content type, magic bytes, file size. Returns validated bytes."""
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, GIF, or WebP)",
        )

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB",
        )

    # Validate magic bytes
    valid = False
    if content[:3] == b'\xff\xd8\xff':  # JPEG
        valid = True
    elif content[:8] == b'\x89PNG\r\n\x1a\n':  # PNG
        valid = True
    elif content[:6] in (b'GIF87a', b'GIF89a'):  # GIF
        valid = True
    elif content[:4] == b'RIFF' and len(content) >= 12 and content[8:12] == b'WEBP':  # WebP
        valid = True

    if not valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is not a valid image (magic bytes check failed)",
        )

    # Validate parseable image with Pillow
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


def _photo_to_response(photo: GalleryPhoto) -> GalleryPhotoResponse:
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
    )


@router.get("", response_model=PaginatedResponse[GalleryPhotoResponse])
async def list_gallery(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    winners_only: bool = Query(True),
    include_hidden: bool = Query(False),
    db: AsyncSession = Depends(get_db),
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

    return PaginatedResponse(
        items=[_photo_to_response(p) for p in photos],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{photo_id}", response_model=GalleryPhotoResponse)
async def get_gallery_photo(photo_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GalleryPhoto).where(GalleryPhoto.id == photo_id))
    photo = result.scalar_one_or_none()
    if photo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    return _photo_to_response(photo)


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
    await log_activity(db, admin, "upload", "gallery", title, f"Uploaded gallery photo: {title}")
    await db.commit()
    await db.refresh(photo)
    return _photo_to_response(photo)


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
    await log_activity(db, admin, "create", "gallery", body.title, f"Created gallery photo: {body.title}")
    await db.commit()
    await db.refresh(photo)
    return _photo_to_response(photo)


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
    return _photo_to_response(photo)


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
    return _photo_to_response(photo)


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
    await db.delete(photo)
    await db.commit()
