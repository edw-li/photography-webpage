import io

from fastapi import APIRouter, Depends, Form, HTTPException, Request, UploadFile, status
from PIL import Image

from ..config import settings
from ..models.user import User
from ..rate_limit import limiter, AUTH_ATTEMPT
from ..schemas.common import CamelModel
from ..services.storage import save_uploaded_image, make_user_slug
from .deps import get_current_user

router = APIRouter()

VALID_CATEGORIES = {"avatars", "gallery", "sample-photos", "general"}
NO_THUMBNAIL_CATEGORIES = {"avatars"}


class UploadResponse(CamelModel):
    url: str


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

    # Reuse the shared image validation from gallery (handles HEIC, magic bytes, PIL check)
    from .gallery import validate_image_upload
    await validate_image_upload(file)

    slug = make_user_slug(user.id, user.first_name, user.last_name)
    url = await save_uploaded_image(file, category, thumbnails=(category not in NO_THUMBNAIL_CATEGORIES), user_slug=slug)
    return UploadResponse(url=url)
