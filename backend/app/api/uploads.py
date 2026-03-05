from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, status

from ..config import settings
from ..models.user import User
from ..schemas.common import CamelModel
from ..services.storage import save_uploaded_image
from .deps import get_current_user

router = APIRouter()

VALID_CATEGORIES = {"avatars", "gallery", "sample-photos", "general"}
NO_THUMBNAIL_CATEGORIES = {"avatars"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


class UploadResponse(CamelModel):
    url: str


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile,
    category: str = Form("general"),
    user: User = Depends(get_current_user),
):
    if category not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid category. Must be one of: {', '.join(sorted(VALID_CATEGORIES))}",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image (JPEG, PNG, GIF, or WebP)",
        )

    # Check file size
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size is {settings.max_upload_size_mb}MB",
        )
    # Seek back so save_uploaded_image can read it
    await file.seek(0)

    url = await save_uploaded_image(file, category, thumbnails=(category not in NO_THUMBNAIL_CATEGORIES))
    return UploadResponse(url=url)
