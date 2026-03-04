from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from PIL import Image, ImageOps

from ..config import settings

UPLOAD_DIR = Path(settings.upload_dir)

THUMBNAIL_SIZES = {
    "thumb": (300, 200),
    "medium": (800, 600),
    "full": (1600, 1200),
}


def _generate_thumbnails(original_path: Path) -> None:
    """Generate thumb, medium, and full-size variants alongside the original."""
    with Image.open(original_path) as img:
        img = ImageOps.exif_transpose(img)

        for suffix, max_size in THUMBNAIL_SIZES.items():
            variant = img.copy()
            variant.thumbnail(max_size, Image.LANCZOS)

            # Convert RGBA to RGB for JPEG output
            if variant.mode == "RGBA" and original_path.suffix.lower() in (".jpg", ".jpeg"):
                variant = variant.convert("RGB")

            out_name = f"{original_path.stem}_{suffix}{original_path.suffix}"
            out_path = original_path.parent / out_name
            variant.save(out_path, quality=85)


async def save_uploaded_image(file: UploadFile, category: str) -> str:
    """Save uploaded image with thumbnails, return URL path."""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    dest_dir = UPLOAD_DIR / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    content = await file.read()
    dest.write_bytes(content)
    _generate_thumbnails(dest)
    return f"/uploads/{category}/{unique_name}"


async def save_gallery_image(file: UploadFile) -> str:
    """Save uploaded gallery image, return URL path like /uploads/gallery/abc123.jpg"""
    return await save_uploaded_image(file, "gallery")


async def save_submission_image(contest_id: int, file: UploadFile) -> str:
    """Save uploaded image, return URL path like /uploads/submissions/1/abc123.jpg"""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    category = f"submissions/{contest_id}"
    dest_dir = UPLOAD_DIR / "submissions" / str(contest_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    content = await file.read()
    dest.write_bytes(content)
    _generate_thumbnails(dest)
    return f"/uploads/{category}/{unique_name}"
