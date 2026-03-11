import io

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from PIL import Image

from ..config import settings
from ..models.user import User
from ..rate_limit import limiter, AUTH_ATTEMPT
from ..schemas.common import CamelModel
from ..services.storage import save_uploaded_image
from .deps import get_current_user

router = APIRouter()

VALID_CATEGORIES = {"avatars", "gallery", "sample-photos", "general"}
NO_THUMBNAIL_CATEGORIES = {"avatars"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


class UploadResponse(CamelModel):
    url: str


def _validate_image_magic_bytes(content: bytes) -> bool:
    """Validate file content starts with known image magic bytes."""
    if content[:3] == b'\xff\xd8\xff':  # JPEG
        return True
    if content[:8] == b'\x89PNG\r\n\x1a\n':  # PNG
        return True
    if content[:6] in (b'GIF87a', b'GIF89a'):  # GIF
        return True
    if content[:4] == b'RIFF' and content[8:12] == b'WEBP':  # WebP
        return True
    return False


@router.post("", response_model=UploadResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_ATTEMPT)
async def upload_file(
    request: Request,
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

    # Validate magic bytes
    if not _validate_image_magic_bytes(content):
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

    # Seek back so save_uploaded_image can read it
    await file.seek(0)

    url = await save_uploaded_image(file, category, thumbnails=(category not in NO_THUMBNAIL_CATEGORIES))
    return UploadResponse(url=url)
