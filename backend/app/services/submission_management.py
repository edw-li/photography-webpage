"""One transactional policy for member submission changes. Dates are advisory."""
import asyncio
import hashlib
import json
import uuid

from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select

from ..config import settings
from ..models.contest import Contest, ContestSubmission, ContestVote, MAX_SUBMISSIONS_PER_USER
from ..models.gallery import GalleryPhoto
from ..models.submission_asset import SubmissionAsset, SubmissionOperation
from ..schemas.contest import ContestSubmissionResponse, SubmissionExifSchema, SubmissionMutation
from .submission_storage import (
    RETENTION, image_keys, key_url, prepare_images, preview_url, queue_cleanup, utcnow, write_images,
)


def lock_reason(contest: Contest) -> str | None:
    if contest.is_imported:
        return "Historical contest entries cannot be changed."
    if contest.submissions_locked_at is not None or contest.status in ("voting", "completed"):
        return "Submissions are locked because voting has begun."
    if contest.status != "active":
        return "This contest is not accepting submissions yet."
    return None


def require_open(contest: Contest):
    reason = lock_reason(contest)
    if reason:
        raise HTTPException(409, reason)


async def lock_contest(db, contest_id: int) -> Contest:
    # Every submission writer and contest transition takes this lock FIRST.
    result = await db.execute(select(Contest).where(Contest.id == contest_id)
                              .execution_options(populate_existing=True).with_for_update())
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(404, "Contest not found")
    return contest


async def owned_submission(db, contest_id, submission_id, user_id):
    sub = (await db.execute(select(ContestSubmission).where(
        ContestSubmission.id == submission_id, ContestSubmission.contest_id == contest_id,
        ContestSubmission.user_id == user_id,
    ).execution_options(populate_existing=True))).scalar_one_or_none()
    if sub is None:
        raise HTTPException(404, "Submission not found. It may have been removed or reassigned.")
    return sub


def snapshot(sub: ContestSubmission) -> dict:
    exif = SubmissionExifSchema(
        camera=sub.exif_camera, focal_length=sub.exif_focal_length,
        aperture=sub.exif_aperture, shutter_speed=sub.exif_shutter_speed, iso=sub.exif_iso,
    )
    return ContestSubmissionResponse(
        id=sub.id, url=sub.url, title=sub.title, photographer=sub.photographer,
        is_own=True, is_assigned=True, exif=exif, revision=sub.revision,
        created_at=sub.created_at, updated_at=sub.updated_at, image_submitted_at=sub.image_submitted_at,
    ).model_dump(mode="json")


async def prepare_upload(db, user, contest_id: int, file: UploadFile, target_id: int | None):
    contest = await lock_contest(db, contest_id)
    require_open(contest)
    if target_id is not None:
        await owned_submission(db, contest_id, target_id, user.id)
    pending = await db.scalar(select(func.count()).select_from(SubmissionAsset).where(
        SubmissionAsset.owner_id == user.id, SubmissionAsset.contest_id == contest_id,
        SubmissionAsset.state.in_(["uploading", "ready"]), SubmissionAsset.expires_at > utcnow(),
    ))
    if pending >= 6:
        raise HTTPException(429, "Finish or discard an existing prepared photo before uploading another.")
    asset_id, owner_id = uuid.uuid4(), user.id
    # Reserve the preparation before releasing the contest lock. No storage work under this lock.
    asset = SubmissionAsset(
        id=asset_id, url=key_url(f"uploads/submissions/{contest_id}/{asset_id.hex}.jpg"),
        owner_id=owner_id, contest_id=contest_id, target_submission_id=target_id,
        state="uploading", object_keys=[], exif={}, expires_at=utcnow() + RETENTION,
    )
    db.add(asset)
    await db.commit()
    try:
        content = await file.read(settings.max_upload_size_mb * 1024 * 1024 + 1)
        if len(content) > settings.max_upload_size_mb * 1024 * 1024:
            raise ValueError(f"Image must be under {settings.max_upload_size_mb}MB.")
        ext, exif, variants = await asyncio.to_thread(prepare_images, content)
        asset.url = key_url(f"uploads/submissions/{contest_id}/{asset_id.hex}{ext}")
        asset.object_keys = image_keys(asset.url)
        asset.exif = exif
        asset.checksum = hashlib.sha256(content).hexdigest()
        # Persist every possible key BEFORE the first storage write, including partial failures.
        await db.commit()
        await asyncio.to_thread(write_images, asset.object_keys, variants)
        asset.state = "ready"
        await db.commit()
        return {"uploadId": str(asset.id), "previewUrl": preview_url(variants, ext),
                "expiresAt": asset.expires_at.isoformat()}
    except Exception as exc:
        await db.rollback()
        failed = await db.get(SubmissionAsset, asset_id, populate_existing=True)
        if failed:
            failed.state = "failed"
            await queue_cleanup(db, failed.url)
            await db.commit()
        if isinstance(exc, ValueError):
            raise HTTPException(422, str(exc)) from None
        raise HTTPException(503, "Could not prepare this image. Your current entry is unchanged; please try again.") from exc


async def mutate_submission(db, user, contest_id: int, action: str,
                            body: SubmissionMutation, submission_id: int | None = None):
    payload = {"contest": contest_id, "submission": submission_id, "action": action,
               **body.model_dump(mode="json")}
    fingerprint = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    # Serialize identical operation IDs even if a malformed client reuses one across contests.
    advisory_key = int.from_bytes(body.operation_id.bytes[:8], "big", signed=True)
    await db.execute(select(func.pg_advisory_xact_lock(advisory_key)))
    receipt = await db.get(SubmissionOperation, body.operation_id)
    if receipt:
        if receipt.user_id != user.id or receipt.fingerprint != fingerprint:
            raise HTTPException(409, "This request ID has already been used for a different change.")
        return receipt.result
    contest = await lock_contest(db, contest_id)
    require_open(contest)
    sub = None
    previous = None
    if action != "add":
        sub = await owned_submission(db, contest_id, submission_id, user.id)
        if body.expected_revision is None:
            raise HTTPException(422, "The submission revision is required.")
        if sub.revision != body.expected_revision:
            raise HTTPException(409, "This entry changed in another tab. Review the latest photo before saving again.")
        # Defense in depth for inconsistent legacy/admin state, independent of the status label.
        has_votes = await db.scalar(select(ContestVote.id).where(ContestVote.submission_id == sub.id).limit(1))
        has_gallery = await db.scalar(select(GalleryPhoto.id).where(GalleryPhoto.contest_submission_id == sub.id).limit(1))
        if has_votes or has_gallery or sub.category_vote_tallies or sub.vote_count:
            raise HTTPException(409, "This entry has already been used in judging and cannot be changed.")
        previous = snapshot(sub)
    count = await db.scalar(select(func.count()).select_from(ContestSubmission).where(
        ContestSubmission.contest_id == contest_id, ContestSubmission.user_id == user.id,
    ))
    if action == "add" and count >= MAX_SUBMISSIONS_PER_USER:
        raise HTTPException(409, "You already have three photos submitted. Replace or remove one to make room.")
    if action in ("add", "replace", "title") and body.title is None:
        raise HTTPException(422, "Give your photo a title.")
    asset = None
    if action in ("add", "replace"):
        asset = (await db.execute(select(SubmissionAsset).where(
            SubmissionAsset.id == body.upload_id,
            SubmissionAsset.owner_id == user.id,
            SubmissionAsset.contest_id == contest_id,
        ).with_for_update())).scalar_one_or_none()
        if asset is None or asset.target_submission_id != submission_id:
            raise HTTPException(404, "Prepared photo not found for this entry.")
        if asset.state != "ready" or asset.expires_at is None or asset.expires_at <= utcnow():
            raise HTTPException(409, "This prepared photo has expired or was already used. Choose the file again.")
    now = utcnow()
    if action == "remove":
        await queue_cleanup(db, sub.url)
        await db.delete(sub)
        count -= 1
    else:
        if action == "add":
            sub = ContestSubmission(contest_id=contest_id, user_id=user.id,
                                    photographer=f"{user.first_name} {user.last_name}".strip(),
                                    title=body.title, url=asset.url, revision=1,
                                    created_at=now, updated_at=now, image_submitted_at=now)
            db.add(sub)
            count += 1
        else:
            sub.revision += 1
            if action == "replace":
                await queue_cleanup(db, sub.url)
        sub.title = body.title
        sub.updated_at = now
        if asset:
            sub.url = asset.url
            sub.image_submitted_at = now
            for field in ("camera", "focal_length", "aperture", "shutter_speed", "iso"):
                setattr(sub, f"exif_{field}", asset.exif.get(field))
            asset.state = "attached"
            asset.expires_at = None
    await db.flush()
    result = {"operationId": str(body.operation_id), "submission": None if action == "remove" else snapshot(sub),
              "removedSubmissionId": submission_id if action == "remove" else None,
              "userSubmissionCount": count}
    db.add(SubmissionOperation(
        id=body.operation_id, user_id=user.id, contest_id=contest_id,
        submission_id=sub.id if sub else None, action=action, fingerprint=fingerprint,
        previous=previous, result=result,
    ))
    await db.commit()
    return result
