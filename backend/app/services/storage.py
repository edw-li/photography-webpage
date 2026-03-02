from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from ..config import settings

UPLOAD_DIR = Path(settings.upload_dir)


async def save_submission_image(contest_id: int, file: UploadFile) -> str:
    """Save uploaded image, return URL path like /uploads/submissions/1/abc123.jpg"""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    dest_dir = UPLOAD_DIR / "submissions" / str(contest_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    content = await file.read()
    dest.write_bytes(content)
    return f"/uploads/submissions/{contest_id}/{unique_name}"


async def save_gallery_image(file: UploadFile) -> str:
    """Save uploaded gallery image, return URL path like /uploads/gallery/abc123.jpg"""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    dest_dir = UPLOAD_DIR / "gallery"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    content = await file.read()
    dest.write_bytes(content)
    return f"/uploads/gallery/{unique_name}"
