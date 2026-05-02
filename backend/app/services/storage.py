import io
import logging
import re
import shutil
import unicodedata
import uuid
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config
from fastapi import UploadFile
from PIL import Image, ImageOps

from ..config import settings


def make_user_slug(user_id: str | uuid.UUID, first_name: str, last_name: str) -> str:
    """Filesystem-safe slug: '{8-hex-prefix}-{name}', e.g. 'a1b2c3d4-john-doe'."""
    hex8 = uuid.UUID(str(user_id)).hex[:8]
    raw = f"{first_name} {last_name}"
    normalized = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    if not slug:
        slug = "user"
    return f"{hex8}-{slug[:60].rstrip('-')}"


def make_photographer_slug(photographer_name: str) -> str:
    """Filesystem-safe slug for admin-imported submissions: 'import-{name}'."""
    normalized = unicodedata.normalize("NFKD", photographer_name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", normalized.lower()).strip("-")
    if not slug:
        slug = "unknown"
    return f"import-{slug[:60].rstrip('-')}"

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
# Image reading (for EXIF backfill)
# ---------------------------------------------------------------------------


def read_image_bytes(url: str) -> bytes | None:
    """Read image bytes from OCI or local storage given a URL. Returns None on failure."""
    try:
        if settings.oci_configured and url.startswith(settings.oci_public_base_url):
            prefix = f"{settings.oci_public_base_url}/"
            object_key = url[len(prefix):]
            client = _get_s3_client()
            response = client.get_object(Bucket=settings.oci_bucket_name, Key=object_key)
            return response["Body"].read()
        elif url.startswith("/uploads/"):
            path = UPLOAD_DIR.parent / url.lstrip("/")
            if path.exists():
                return path.read_bytes()
    except Exception:
        logger.warning("Failed to read image: %s", url)
    return None


def extract_exif_from_bytes(content: bytes) -> dict[str, str | int | None]:
    """Extract EXIF fields from image bytes using Pillow. Returns dict with available fields."""
    result: dict[str, str | int | None] = {}
    try:
        with Image.open(io.BytesIO(content)) as img:
            exif_data = img.getexif()
            if not exif_data:
                return result

            # Standard EXIF tags
            make = exif_data.get(0x010F, "").strip()     # Make
            model = exif_data.get(0x0110, "").strip()     # Model
            if model and make and model.lower().startswith(make.lower()):
                result["camera"] = model
            elif model and make:
                result["camera"] = f"{make} {model}"
            elif model:
                result["camera"] = model
            elif make:
                result["camera"] = make

            # IFD EXIF sub-tags
            ifd = exif_data.get_ifd(0x8769)
            if ifd:
                focal = ifd.get(0xA405) or ifd.get(0x920A)  # FocalLengthIn35mm or FocalLength
                if focal is not None:
                    result["focal_length"] = f"{round(float(focal))}mm"

                fnumber = ifd.get(0x829D)  # FNumber
                if fnumber is not None:
                    result["aperture"] = f"f/{float(fnumber)}"

                exposure = ifd.get(0x829A)  # ExposureTime
                if exposure is not None:
                    exp = float(exposure)
                    if exp >= 1:
                        result["shutter_speed"] = f"{exp}s"
                    elif exp > 0:
                        result["shutter_speed"] = f"1/{round(1/exp)}s"

                iso = ifd.get(0x8827)  # ISOSpeedRatings
                if iso is not None:
                    result["iso"] = int(iso)
    except Exception:
        logger.warning("Failed to extract EXIF from image bytes")
    return result


# ---------------------------------------------------------------------------
# HEIC/HEIF conversion
# ---------------------------------------------------------------------------

_HEIC_EXTENSIONS = {".heic", ".heif"}


def _convert_heic_to_jpeg(content: bytes) -> tuple[bytes, str]:
    """Convert HEIC/HEIF bytes to JPEG. Returns (jpeg_bytes, '.jpg')."""
    with Image.open(io.BytesIO(content)) as img:
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=92)
        return buf.getvalue(), ".jpg"


# ---------------------------------------------------------------------------
# Public API (unchanged signatures)
# ---------------------------------------------------------------------------

# All current callers (make_user_slug, make_photographer_slug, frontend slugify)
# produce lowercase alphanumeric + hyphens, starting with [a-z0-9]. Be strict
# defense-in-depth — refuse anything that could include path separators, '..',
# leading dots, or non-ASCII.
_PATH_SEGMENT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,199}$")


def _safe_path_segment(segment: str) -> str:
    """Return segment if it's a safe single-path component, else raise ValueError."""
    if not _PATH_SEGMENT_RE.fullmatch(segment):
        raise ValueError(f"Unsafe path segment: {segment!r}")
    return segment


async def save_uploaded_image(
    file: UploadFile,
    category: str,
    thumbnails: bool = True,
    user_slug: str | None = None,
    subdir: str | None = None,
) -> str:
    """Save uploaded image, optionally with thumbnails. Return URL path.

    Pass `subdir` to nest under `{category}/{subdir}/` (used for newsletter-scoped
    uploads). `subdir` is sanitized; takes precedence over `user_slug` when both
    are passed.
    """
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    content = await file.read()

    # Convert HEIC/HEIF to JPEG so stored files are always web-safe
    if ext.lower() in _HEIC_EXTENSIONS:
        content, ext = _convert_heic_to_jpeg(content)

    unique_name = f"{uuid4().hex}{ext}"

    nested = subdir if subdir is not None else user_slug
    if nested is not None:
        effective_category = f"{category}/{_safe_path_segment(nested)}"
    else:
        effective_category = category

    if settings.oci_configured:
        if thumbnails:
            return _upload_with_thumbnails_oci(content, effective_category, unique_name, ext)
        object_key = f"uploads/{effective_category}/{unique_name}"
        return _upload_to_oci(content, object_key, ext)

    if thumbnails:
        return _save_local(content, effective_category, unique_name)
    dest_dir = UPLOAD_DIR / effective_category
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / unique_name
    dest.write_bytes(content)
    return f"/uploads/{effective_category}/{unique_name}"


def absolutize_upload_url(url: str) -> str:
    """Return an absolute URL for an upload path.

    OCI/external URLs are passed through. Relative paths are prefixed with
    `settings.frontend_url` so they work in email clients (which can't
    resolve relative URLs).
    """
    if not url:
        return url
    if url.startswith("http://") or url.startswith("https://"):
        return url
    base = settings.frontend_url.rstrip("/")
    path = url if url.startswith("/") else f"/{url}"
    return f"{base}{path}"


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


def _delete_local_directory(path: Path) -> None:
    """Recursively delete a local directory if it exists.

    Missing directories are a silent no-op. Permission/IO errors are swallowed
    so a transient failure can't block the caller (which has typically already
    decided to remove the parent resource).
    """
    shutil.rmtree(path, ignore_errors=True)


def _delete_oci_prefix(prefix: str) -> None:
    """Delete every OCI object whose key starts with `prefix`.

    Pages through `list_objects_v2` and batches keys into `delete_objects` calls
    of up to 1000 keys each (S3/OCI's documented batch cap). Per-batch failures
    are logged but don't propagate.
    """
    client = _get_s3_client()
    paginator = client.get_paginator("list_objects_v2")

    batch: list[dict[str, str]] = []

    def flush() -> None:
        if not batch:
            return
        try:
            client.delete_objects(
                Bucket=settings.oci_bucket_name,
                Delete={"Objects": batch, "Quiet": True},
            )
        except Exception:
            logger.warning(
                "Failed to delete OCI batch under prefix %s (%d keys)",
                prefix, len(batch), exc_info=True,
            )
        batch.clear()

    try:
        for page in paginator.paginate(Bucket=settings.oci_bucket_name, Prefix=prefix):
            for obj in page.get("Contents", []):
                batch.append({"Key": obj["Key"]})
                if len(batch) >= 1000:
                    flush()
        flush()
    except Exception:
        logger.warning(
            "Failed to list OCI objects under prefix %s", prefix, exc_info=True,
        )


def delete_uploaded_directory(category: str, subdir: str) -> None:
    """Delete every file under uploads/{category}/{subdir}/ in either OCI or local mode.

    Used for resource-scoped cleanup (e.g. a newsletter's image folder on delete).
    Catches originals + thumbnails + any orphaned uploads in one operation —
    no markdown/HTML parsing needed. Path segments are validated for safety.
    Missing directories / empty prefixes are a silent no-op.
    """
    safe_category = _safe_path_segment(category)
    safe_subdir = _safe_path_segment(subdir)

    if settings.oci_configured:
        _delete_oci_prefix(f"uploads/{safe_category}/{safe_subdir}/")
    else:
        _delete_local_directory(UPLOAD_DIR / safe_category / safe_subdir)


async def save_gallery_image(file: UploadFile, user_slug: str | None = None) -> str:
    """Save uploaded gallery image, return URL."""
    return await save_uploaded_image(file, "gallery", user_slug=user_slug)


async def save_submission_image(contest_month: str, file: UploadFile, user_slug: str | None = None) -> str:
    """Save uploaded contest submission image, return URL."""
    ext = Path(file.filename or "image.jpg").suffix or ".jpg"
    content = await file.read()

    # Convert HEIC/HEIF to JPEG so stored files are always web-safe
    if ext.lower() in _HEIC_EXTENSIONS:
        content, ext = _convert_heic_to_jpeg(content)

    unique_name = f"{uuid4().hex}{ext}"
    category = f"submissions/{contest_month}"
    if user_slug:
        category = f"{category}/{user_slug}"

    if settings.oci_configured:
        return _upload_with_thumbnails_oci(content, category, unique_name, ext)
    return _save_local(content, category, unique_name)
