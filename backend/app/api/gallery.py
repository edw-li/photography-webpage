import math

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.gallery import GalleryPhoto
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.gallery import (
    GalleryPhotoResponse,
    GalleryPhotoUpdate,
    PhotoExifSchema,
)
from ..services.storage import delete_uploaded_image, save_gallery_image
from .activity import log_activity
from .deps import get_db, require_admin

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
    )


@router.get("", response_model=PaginatedResponse[GalleryPhotoResponse])
async def list_gallery(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(GalleryPhoto))
    total = count_result.scalar_one()

    result = await db.execute(
        select(GalleryPhoto).order_by(GalleryPhoto.id).offset((page - 1) * page_size).limit(page_size)
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
async def upload_gallery_photo(
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
    url = await save_gallery_image(file)
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
