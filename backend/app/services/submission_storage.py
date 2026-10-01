"""Tracked image preparation and restart-safe, reference-aware cleanup."""
import asyncio
import base64
import io
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath

from fastapi import HTTPException
from PIL import Image, ImageOps
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from ..config import settings
from ..database import async_session
from ..models.contest import ContestSubmission
from ..models.gallery import GalleryPhoto
from ..models.member import Member, SamplePhoto
from ..models.newsletter import Newsletter
from ..models.submission_asset import StorageCleanupJob, SubmissionAsset
from . import storage

logger = logging.getLogger(__name__)
RETENTION = timedelta(hours=24)


def utcnow():
    return datetime.now(timezone.utc)


def image_keys(url: str) -> list[str]:
    """Resolve only our own storage URLs; never delete arbitrary client paths."""
    prefixes = ["/uploads/", settings.frontend_url.rstrip("/") + "/uploads/"]
    if settings.oci_configured:
        prefixes.insert(0, settings.oci_public_base_url + "/uploads/")
    key = None
    for prefix in prefixes:
        if url.startswith(prefix):
            key = "uploads/" + url[len(prefix):]
            break
    if key is None or any(c in key for c in ("\\", "?", "#", "%")):
        return []
    path = PurePosixPath(key)
    if ".." in path.parts or path.is_absolute():
        return []
    stem = re.sub(r"_(thumb|medium|full)$", "", path.stem)
    return [str(path.with_name(stem + path.suffix))] + [
        str(path.with_name(f"{stem}_{size}{path.suffix}")) for size in storage.THUMBNAIL_SIZES
    ]


def key_url(key: str) -> str:
    return f"{settings.oci_public_base_url}/{key}" if settings.oci_configured else f"/{key}"


def prepare_images(content: bytes) -> tuple[str, dict, dict[str, bytes]]:
    """Decode before accepting. Extract metadata before conversion; normalize orientation."""
    try:
        with Image.open(io.BytesIO(content)) as source:
            if source.width * source.height > 60_000_000:
                raise ValueError("Image dimensions are too large (maximum 60 megapixels).")
            if source.format not in {"JPEG", "PNG", "WEBP", "GIF", "HEIF", "HEIC"}:
                raise ValueError("Choose a JPEG, PNG, WebP, GIF, or HEIC image.")
            source.verify()
        raw_exif = storage.extract_exif_from_bytes(content)
        exif = {field: str(raw_exif[field])[:limit] for field, limit in
                {"camera": 100, "focal_length": 50, "aperture": 50, "shutter_speed": 50}.items()
                if raw_exif.get(field) is not None}
        iso = raw_exif.get("iso")
        if isinstance(iso, int) and 0 <= iso <= 2_147_483_647:
            exif["iso"] = iso
        with Image.open(io.BytesIO(content)) as source:
            img = ImageOps.exif_transpose(source)
            # Static photographs are normalized without camera/GPS metadata in the bytes.
            # Camera fields used by the site are stored separately in the registry.
            ext = ".png" if "A" in img.getbands() else ".jpg"
            if ext == ".jpg":
                img = img.convert("RGB")
            img.info.clear()
            out = io.BytesIO()
            img.save(out, format="PNG" if ext == ".png" else "JPEG", quality=95, subsampling=0)
            original = out.getvalue()
        variants = {"original": original}
        for size, dimensions in storage.THUMBNAIL_SIZES.items():
            variants[size] = storage._generate_thumbnail_bytes(original, ext, dimensions)
        return ext, exif, variants
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError("Image dimensions are too large.") from None
    except ValueError:
        raise
    except Exception:
        raise ValueError("This file could not be read as a supported image.") from None


def write_images(keys: list[str], variants: dict[str, bytes]):
    for key, content in zip(keys, variants.values(), strict=True):
        ext = PurePosixPath(key).suffix
        if settings.oci_configured:
            storage._upload_to_oci(content, key, ext)
        else:
            path = storage.UPLOAD_DIR / PurePosixPath(key).relative_to("uploads")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)


def preview_url(variants: dict[str, bytes], ext: str) -> str:
    mime = "image/png" if ext == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(variants['medium']).decode('ascii')}"


def delete_keys(keys: list[str]):
    """Raise on failure so the durable job can retry, including partial deletions."""
    client = storage._get_s3_client() if settings.oci_configured else None
    for key in keys:
        if not key.startswith("uploads/") or ".." in PurePosixPath(key).parts or "\\" in key:
            raise ValueError("Unsafe image key")
        if client:
            client.delete_object(Bucket=settings.oci_bucket_name, Key=key)
        else:
            root = storage.UPLOAD_DIR.resolve()
            path = (root / PurePosixPath(key).relative_to("uploads")).resolve()
            if not path.is_relative_to(root):
                raise ValueError("Image path is outside the upload directory")
            path.unlink(missing_ok=True)


async def protect_image_reference(db, url: str):
    """Attachment and cleanup serialize on the same asset row, including variants."""
    keys = image_keys(url)
    canonical = key_url(keys[0]) if keys else url
    asset = (await db.execute(select(SubmissionAsset).where(
        SubmissionAsset.url.in_([url, canonical])
    ).with_for_update())).scalar_one_or_none()
    if asset and asset.state != "attached":
        raise HTTPException(409, "This image is no longer available. Upload it again.")


async def protect_content_references(db, content: str):
    """Prevent managed content from attaching an image already being deleted."""
    assets = (await db.execute(select(SubmissionAsset.url))).scalars().all()
    for url in sorted(assets):
        keys = image_keys(url)
        if any(candidate in content for candidate in [url] + [key_url(k) for k in keys]):
            await protect_image_reference(db, url)


async def queue_cleanup(db, url: str, *, delay: timedelta = RETENTION):
    if not image_keys(url):
        return  # external / unrecognized historical objects are never auto-deleted
    # Registry rows also cover older admin uploads created after the migration.
    import uuid
    await db.execute(insert(SubmissionAsset).values(
        id=uuid.uuid4(), url=url, state="attached", object_keys=image_keys(url), exif={},
    ).on_conflict_do_nothing(index_elements=["url"]))
    await db.execute(insert(StorageCleanupJob).values(
        url=url, not_before=utcnow() + delay,
    ).on_conflict_do_update(index_elements=["url"], set_={"not_before": utcnow() + delay}))


async def is_referenced(db, url: str) -> bool:
    keys = image_keys(url)
    urls = list({url, *[key_url(k) for k in keys], *["/" + k for k in keys],
                 *[settings.frontend_url.rstrip("/") + "/" + k for k in keys]})
    for model, column in [(ContestSubmission, ContestSubmission.url), (GalleryPhoto, GalleryPhoto.url),
                          (Member, Member.avatar_url), (SamplePhoto, SamplePhoto.src_url)]:
        if (await db.execute(select(model.id).where(column.in_(urls)).limit(1))).first():
            return True
    # Newsletters can embed images as Markdown or HTML rather than a dedicated URL column.
    if (await db.execute(select(Newsletter.id).where(or_(
        *[Newsletter.body_md.contains(u, autoescape=True) for u in urls],
        *[Newsletter.html.contains(u, autoescape=True) for u in urls],
    )).limit(1))).first():
        return True
    return False


async def cleanup_once() -> bool:
    """Claim one job; state fences attachments while storage work runs outside the transaction."""
    async with async_session() as db:
        expired = (await db.execute(select(SubmissionAsset).where(
            SubmissionAsset.expires_at <= utcnow(),
            SubmissionAsset.state.in_(["uploading", "ready", "failed"]),
        ).with_for_update(skip_locked=True).limit(20))).scalars().all()
        for asset in expired:
            await queue_cleanup(db, asset.url, delay=timedelta())
            asset.expires_at = None
        await db.commit()
        candidate = (await db.execute(select(StorageCleanupJob.id, StorageCleanupJob.url).where(
            StorageCleanupJob.not_before <= utcnow()
        ).order_by(StorageCleanupJob.not_before).limit(1))).first()
        if candidate is None:
            return False
        asset = (await db.execute(select(SubmissionAsset).where(
            SubmissionAsset.url == candidate.url
        ).with_for_update(skip_locked=True))).scalar_one_or_none()
        if asset is None:
            return False
        # Match writers' asset -> outbox order, avoiding cleanup/mutation deadlocks.
        job = (await db.execute(select(StorageCleanupJob).where(
            StorageCleanupJob.id == candidate.id, StorageCleanupJob.not_before <= utcnow()
        ).with_for_update(skip_locked=True))).scalar_one_or_none()
        if job is None:
            return False
        if await is_referenced(db, job.url):
            # Recheck later: another shared reference can be removed in the future.
            job.not_before = utcnow() + RETENTION
            await db.commit()
            return True
        asset.state = "deleting"
        job.not_before = utcnow() + timedelta(minutes=5)  # restart / multi-worker lease
        job.attempts += 1
        job_id, asset_id = job.id, asset.id
        keys = asset.object_keys or image_keys(asset.url)
        await db.commit()
    try:
        await asyncio.to_thread(delete_keys, keys)
    except Exception as exc:
        logger.exception("Image cleanup job %s failed", job_id)
        async with async_session() as db:
            job = await db.get(StorageCleanupJob, job_id)
            if job:
                job.last_error = str(exc)[:1000]
                job.not_before = utcnow() + timedelta(minutes=min(1440, 2 ** min(job.attempts, 10)))
                await db.commit()
    else:
        async with async_session() as db:
            asset = await db.get(SubmissionAsset, asset_id)
            asset.state = "deleted"
            job = await db.get(StorageCleanupJob, job_id)
            if job:
                await db.delete(job)
            await db.commit()
    return True


async def cleanup_loop():
    while True:
        try:
            for _ in range(25):
                if not await cleanup_once():
                    break
        except Exception:
            logger.exception("Submission cleanup sweep failed; will retry")
        await asyncio.sleep(60)
