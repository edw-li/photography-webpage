import io
import logging
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config
from fastapi import UploadFile
from PIL import Image, ImageOps

from ..config import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(settings.upload_dir)

THUMBNAIL_SIZES = {
    "thumb": (300, 200),
    "medium": (800, 600),
    "full": (1600, 1200),
}

# Map extensions to PIL save format + content type
_FORMAT_MAP = {
    ".jpg": ("JPEG", "image/jpeg"),
    ".jpeg": ("JPEG", "image/jpeg"),
    ".png": ("PNG", "image/png"),
    ".gif": ("GIF", "image/gif"),
    ".webp": ("WEBP", "image/webp"),
}


# ---------------------------------------------------------------------------
# OCI / S3 helpers
# ---------------------------------------------------------------------------

def _get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.oci_s3_endpoint,
        aws_access_key_id=settings.oci_access_key,
        aws_secret_access_key=settings.oci_secret_key,
        region_name=settings.oci_region,
        config=Config(
            signature_version="s3v4",
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def _content_type_for(ext: str) -> str:
    return _FORMAT_MAP.get(ext.lower(), ("JPEG", "image/jpeg"))[1]


def _pil_format_for(ext: str) -> str:
    return _FORMAT_MAP.get(ext.lower(), ("JPEG", "image/jpeg"))[0]


def _generate_thumbnail_bytes(content: bytes, ext: str, max_size: tuple[int, int]) -> bytes:
    """Generate a thumbnail in-memory from raw image bytes."""
    with Image.open(io.BytesIO(content)) as img:
        img = ImageOps.exif_transpose(img)
        img.thumbnail(max_size, Image.LANCZOS)
        if img.mode == "RGBA" and ext.lower() in (".jpg", ".jpeg"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format=_pil_format_for(ext), quality=85)
        return buf.getvalue()


def _upload_to_oci(data: bytes, object_key: str, ext: str) -> str:
    """Upload bytes to OCI bucket, return public URL."""
    client = _get_s3_client()
    client.put_object(
        Bucket=settings.oci_bucket_name,
        Key=object_key,
        Body=data,
        ContentLength=len(data),
        ContentType=_content_type_for(ext),
    )
    public_url = f"{settings.oci_public_base_url}/{object_key}"
    logger.info("Uploaded to OCI: %s", public_url)
    return public_url


def _upload_with_thumbnails_oci(content: bytes, category: str, unique_name: str, ext: str) -> str:
    """Upload original + 3 thumbnail variants to OCI. Returns the original's public URL."""
    stem = Path(unique_name).stem
    base_key = f"uploads/{category}/{unique_name}"

    # Upload original
    url = _upload_to_oci(content, base_key, ext)

    # Upload thumbnails
    for suffix, max_size in THUMBNAIL_SIZES.items():
        thumb_bytes = _generate_thumbnail_bytes(content, ext, max_size)
        thumb_key = f"uploads/{category}/{stem}_{suffix}{ext}"
        _upload_to_oci(thumb_bytes, thumb_key, ext)

    return url


# ---------------------------------------------------------------------------
# Local filesystem helpers
# ---------------------------------------------------------------------------

def _generate_thumbnails_local(original_path: Path) -> None:
    """Generate thumb, medium, and full-size variants alongside the original."""
    with Image.open(original_path) as img:
        img = ImageOps.exif_transpose(img)

        for suffix, max_size in THUMBNAIL_SIZES.items():
            variant = img.copy()
            variant.thumbnail(max_size, Image.LANCZOS)

            if variant.mode == "RGBA" and original_path.suffix.lower() in (".jpg", ".jpeg"):
                variant = variant.convert("RGB")

            out_name = f"{original_path.stem}_{suffix}{original_path.suffix}"
            out_path = original_path.parent / out_name
            variant.save(out_path, quality=85)


def _save_local(content: bytes, category: str, unique_name: str) -> str:
    """Save image + thumbnails to local filesystem. Returns /uploads/... path."""
    dest_dir = UPLOAD_DIR / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    dest.write_bytes(content)
    _generate_thumbnails_local(dest)
    return f"/uploads/{category}/{unique_name}"


# ---------------------------------------------------------------------------
# Public API (unchanged signatures)
# ---------------------------------------------------------------------------

async def save_uploaded_image(file: UploadFile, category: str, thumbnails: bool = True) -> str:
    """Save uploaded image, optionally with thumbnails. Return URL path."""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    content = await file.read()

    if settings.oci_configured:
        if thumbnails:
            return _upload_with_thumbnails_oci(content, category, unique_name, ext)
        object_key = f"uploads/{category}/{unique_name}"
        return _upload_to_oci(content, object_key, ext)

    if thumbnails:
        return _save_local(content, category, unique_name)
    dest_dir = UPLOAD_DIR / category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    dest.write_bytes(content)
    return f"/uploads/{category}/{unique_name}"


def delete_uploaded_image(url: str, thumbnails: bool = True) -> None:
    """Delete an image and optionally its thumbnail variants from storage."""
    if settings.oci_configured and url.startswith(settings.oci_public_base_url):
        if thumbnails:
            _delete_from_oci(url)
        else:
            _delete_single_from_oci(url)
    elif url.startswith("/uploads/"):
        if thumbnails:
            _delete_local(url)
        else:
            path = UPLOAD_DIR.parent / url.lstrip("/")
            path.unlink(missing_ok=True)


def _delete_single_from_oci(url: str) -> None:
    """Delete a single object from OCI (no thumbnail variants)."""
    prefix = f"{settings.oci_public_base_url}/"
    object_key = url[len(prefix):]
    client = _get_s3_client()
    try:
        client.delete_object(Bucket=settings.oci_bucket_name, Key=object_key)
    except Exception:
        logger.warning("Failed to delete OCI object: %s", object_key)


def _delete_from_oci(url: str) -> None:
    """Delete original + thumbnail variants from OCI."""
    prefix = f"{settings.oci_public_base_url}/"
    object_key = url[len(prefix):]
    stem = Path(object_key).stem
    ext = Path(object_key).suffix
    parent = str(Path(object_key).parent)
    client = _get_s3_client()
    keys = [object_key] + [f"{parent}/{stem}_{s}{ext}" for s in THUMBNAIL_SIZES]
    for key in keys:
        try:
            client.delete_object(Bucket=settings.oci_bucket_name, Key=key)
        except Exception:
            logger.warning("Failed to delete OCI object: %s", key)


def _delete_local(url: str) -> None:
    """Delete original + thumbnail variants from local filesystem."""
    rel = url.lstrip("/")
    path = UPLOAD_DIR.parent / rel
    stem, ext = path.stem, path.suffix
    for file in [path] + [path.parent / f"{stem}_{s}{ext}" for s in THUMBNAIL_SIZES]:
        file.unlink(missing_ok=True)


async def save_gallery_image(file: UploadFile) -> str:
    """Save uploaded gallery image, return URL."""
    return await save_uploaded_image(file, "gallery")


async def save_submission_image(contest_month: str, file: UploadFile) -> str:
    """Save uploaded contest submission image, return URL."""
    from datetime import datetime as dt

    parsed = dt.strptime(contest_month, "%B %Y")
    folder_name = parsed.strftime("%Y-%m")

    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    unique_name = f"{uuid4().hex}{ext}"
    category = f"submissions/{folder_name}"
    content = await file.read()

    if settings.oci_configured:
        return _upload_with_thumbnails_oci(content, category, unique_name, ext)
    return _save_local(content, category, unique_name)
