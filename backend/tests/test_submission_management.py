"""Integration tests use an isolated schema in an explicitly supplied LOCAL test DB.

TEST_DATABASE_URL=postgresql+asyncpg://...@127.0.0.1:55432/photography_test
Run: python -m pytest backend/tests/test_submission_management.py -q
"""
import asyncio
import io
import os
import sys
import uuid
from datetime import timedelta
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi import HTTPException, UploadFile
from PIL import Image
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import Base
from app.models import Contest, ContestSubmission, GalleryPhoto, SubmissionAsset, SubmissionOperation, StorageCleanupJob, User
from app.schemas.contest import ContestUpdate, SubmissionMutation
from app.services import submission_management as service, submission_storage as media


@pytest_asyncio.fixture
async def db_env(monkeypatch, tmp_path):
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TEST_DATABASE_URL to a local PostgreSQL test database")
    parsed = make_url(url)
    assert parsed.host in ("localhost", "127.0.0.1", "::1") and parsed.database.endswith("_test"), "Only local test databases are allowed"
    schema = "submission_test_" + uuid.uuid4().hex
    bootstrap = create_async_engine(url)
    async with bootstrap.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_async_engine(url, connect_args={"server_settings": {"search_path": schema}})
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(media, "async_session", sessions)
    monkeypatch.setattr(media.settings, "oci_access_key", "")
    monkeypatch.setattr(media.storage, "UPLOAD_DIR", tmp_path / "uploads")
    async with sessions() as db:
        user = User(email="member@example.com", first_name="Test", last_name="Member", hashed_password="unused", role="member", is_active=True)
        other = User(email="other@example.com", first_name="Other", last_name="Member", hashed_password="unused", role="member", is_active=True)
        contest = Contest(month="2020-01", theme="Light", description="Test", status="active", deadline="2020-01-31", guidelines=[])
        db.add_all([user, other, contest])
        await db.commit()
        ids = (user.id, other.id, contest.id)
    yield sessions, ids
    await engine.dispose()
    async with bootstrap.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    await bootstrap.dispose()


def jpeg_bytes():
    output = io.BytesIO()
    Image.new("RGB", (30, 20), "red").save(output, "JPEG")
    return output.getvalue()


async def prepare(sessions, ids, target=None, owner=None):
    async with sessions() as db:
        user = await db.get(User, owner or ids[0])
        return await service.prepare_upload(db, user, ids[2], UploadFile(file=io.BytesIO(jpeg_bytes()), filename="test.jpg"), target)


async def change(sessions, ids, action, *, target=None, revision=None, upload=None, title="New photo", op=None, owner=None):
    async with sessions() as db:
        user = await db.get(User, owner or ids[0])
        body = SubmissionMutation(operation_id=op or uuid.uuid4(), expected_revision=revision,
                                  upload_id=upload, title=title if action != "remove" else None)
        return await service.mutate_submission(db, user, ids[2], action, body, target)


async def add(sessions, ids):
    upload = await prepare(sessions, ids)
    result = await change(sessions, ids, "add", upload=upload["uploadId"])
    return result["submission"]


@pytest.mark.asyncio
async def test_past_deadline_stays_open_and_replace_at_capacity(db_env):
    sessions, ids = db_env
    entries = [await add(sessions, ids) for _ in range(3)]
    original = entries[0]
    async with sessions() as db:
        sub = await db.get(ContestSubmission, original["id"])
        sub.exif_camera = "Old camera"
        sub.exif_iso = 3200
        await db.commit()
    prepared = await prepare(sessions, ids, original["id"])
    result = await change(sessions, ids, "replace", target=original["id"], revision=1, upload=prepared["uploadId"])
    assert result["userSubmissionCount"] == 3
    assert result["submission"]["id"] == original["id"]
    assert result["submission"]["url"] != original["url"]
    assert result["submission"]["createdAt"] == original["createdAt"]
    assert result["submission"]["exif"]["camera"] is None
    assert result["submission"]["exif"]["iso"] is None
    assert result["submission"]["revision"] == 2
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(StorageCleanupJob)) == 1


@pytest.mark.asyncio
async def test_concurrent_last_slot_is_serialized(db_env):
    sessions, ids = db_env
    await add(sessions, ids)
    await add(sessions, ids)
    a, b = await asyncio.gather(prepare(sessions, ids), prepare(sessions, ids))
    results = await asyncio.gather(
        change(sessions, ids, "add", upload=a["uploadId"]),
        change(sessions, ids, "add", upload=b["uploadId"]), return_exceptions=True,
    )
    assert sum(isinstance(r, HTTPException) and r.status_code == 409 for r in results) == 1
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(ContestSubmission)) == 3


@pytest.mark.asyncio
async def test_simultaneous_retry_creates_one_entry_and_receipt(db_env):
    sessions, ids = db_env
    prepared = await prepare(sessions, ids)
    operation = uuid.uuid4()
    results = await asyncio.gather(*[
        change(sessions, ids, "add", upload=prepared["uploadId"], op=operation) for _ in range(2)
    ])
    assert results[0] == results[1]
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(ContestSubmission)) == 1
        assert await db.scalar(select(func.count()).select_from(SubmissionOperation)) == 1
    with pytest.raises(HTTPException) as error:
        await change(sessions, ids, "add", upload=prepared["uploadId"], op=operation, title="Different payload")
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_title_change_and_removal_check_revision(db_env):
    sessions, ids = db_env
    original = await add(sessions, ids)
    result = await change(sessions, ids, "title", target=original["id"], revision=1, title="Corrected title")
    assert result["submission"]["url"] == original["url"]
    assert result["submission"]["imageSubmittedAt"] == original["imageSubmittedAt"]
    with pytest.raises(HTTPException) as error:
        await change(sessions, ids, "remove", target=original["id"], revision=1)
    assert error.value.status_code == 409
    operation = uuid.uuid4()
    first = await change(sessions, ids, "remove", target=original["id"], revision=2, op=operation)
    retry = await change(sessions, ids, "remove", target=original["id"], revision=2, op=operation)
    assert first == retry and first["userSubmissionCount"] == 0
    async with sessions() as db:
        assert await db.get(ContestSubmission, original["id"]) is None
        assert (await db.get(SubmissionOperation, operation)).previous["title"] == "Corrected title"


@pytest.mark.asyncio
async def test_ownership_and_preparation_scope(db_env):
    sessions, ids = db_env
    original = await add(sessions, ids)
    with pytest.raises(HTTPException) as error:
        await change(sessions, ids, "title", target=original["id"], revision=1, owner=ids[1])
    assert error.value.status_code == 404
    prepared = await prepare(sessions, ids, original["id"])
    with pytest.raises(HTTPException):
        await change(sessions, ids, "add", upload=prepared["uploadId"])
    with pytest.raises(HTTPException):
        await change(sessions, ids, "add", upload=prepared["uploadId"], owner=ids[1])


@pytest.mark.asyncio
async def test_voting_wins_race_and_lock_survives_reversion(db_env):
    from app.api.contests import update_contest
    sessions, ids = db_env
    original = await add(sessions, ids)
    prepared = await prepare(sessions, ids, original["id"])
    async with sessions() as transition:
        contest = await service.lock_contest(transition, ids[2])
        contest.status = "voting"
        contest.submissions_locked_at = media.utcnow()
        waiting = asyncio.create_task(change(sessions, ids, "replace", target=original["id"], revision=1, upload=prepared["uploadId"]))
        await asyncio.sleep(.05)
        assert not waiting.done()
        await transition.commit()
    with pytest.raises(HTTPException) as error:
        await waiting
    assert error.value.status_code == 409
    async with sessions() as db:
        admin = await db.get(User, ids[0])
        await update_contest(ids[2], ContestUpdate(status="active"), admin, db)
    with pytest.raises(HTTPException):
        await change(sessions, ids, "replace", target=original["id"], revision=1, upload=prepared["uploadId"])
    async with sessions() as db:
        assert (await db.get(ContestSubmission, original["id"])).url == original["url"]


@pytest.mark.asyncio
async def test_receipt_replays_after_contest_locks(db_env):
    sessions, ids = db_env
    prepared = await prepare(sessions, ids)
    operation = uuid.uuid4()
    first = await change(sessions, ids, "add", upload=prepared["uploadId"], op=operation)
    async with sessions() as db:
        contest = await db.get(Contest, ids[2])
        contest.status = "voting"
        contest.submissions_locked_at = media.utcnow()
        await db.commit()
    assert await change(sessions, ids, "add", upload=prepared["uploadId"], op=operation) == first


@pytest.mark.asyncio
async def test_partial_upload_and_abandoned_preparation_are_collected(db_env, monkeypatch):
    sessions, ids = db_env
    original_writer = media.write_images
    def partial(keys, variants):
        original_writer(keys[:1], {"original": variants["original"]})
        raise OSError("simulated storage outage")
    monkeypatch.setattr(service, "write_images", partial)
    with pytest.raises(HTTPException) as error:
        await prepare(sessions, ids)
    assert error.value.status_code == 503
    assert list(media.storage.UPLOAD_DIR.rglob("*.jpg"))
    async with sessions() as db:
        jobs = (await db.execute(select(StorageCleanupJob))).scalars().all()
        for job in jobs:
            job.not_before = media.utcnow() - timedelta(seconds=1)
        await db.commit()
    await media.cleanup_once()
    assert not list(media.storage.UPLOAD_DIR.rglob("*.jpg"))
    monkeypatch.setattr(service, "write_images", original_writer)
    prepared = await prepare(sessions, ids)
    async with sessions() as db:
        asset = await db.get(SubmissionAsset, uuid.UUID(prepared["uploadId"]))
        asset.expires_at = media.utcnow() - timedelta(seconds=1)
        await db.commit()
    await media.cleanup_once()
    assert not list(media.storage.UPLOAD_DIR.rglob("*.jpg"))


@pytest.mark.asyncio
async def test_cleanup_preserves_shared_gallery_and_retries_failure(db_env, monkeypatch):
    sessions, ids = db_env
    original = await add(sessions, ids)
    prepared = await prepare(sessions, ids, original["id"])
    await change(sessions, ids, "replace", target=original["id"], revision=1, upload=prepared["uploadId"])
    async with sessions() as db:
        db.add(GalleryPhoto(url=original["url"], title="Shared", photographer="Member"))
        job = await db.scalar(select(StorageCleanupJob))
        job.not_before = media.utcnow() - timedelta(seconds=1)
        await db.commit()
    await media.cleanup_once()
    async with sessions() as db:
        assert (await db.scalar(select(SubmissionAsset).where(SubmissionAsset.url == original["url"]))).state == "attached"
        await db.delete(await db.scalar(select(GalleryPhoto)))
        job = await db.scalar(select(StorageCleanupJob))
        job.not_before = media.utcnow() - timedelta(seconds=1)
        await db.commit()
    def fail(keys):
        raise OSError("storage unavailable")
    real_delete = media.delete_keys
    monkeypatch.setattr(media, "delete_keys", fail)
    await media.cleanup_once()
    async with sessions() as db:
        job = await db.scalar(select(StorageCleanupJob))
        assert job.attempts == 1 and "storage unavailable" in job.last_error
        with pytest.raises(HTTPException):
            await media.protect_image_reference(db, original["url"])
        await db.rollback()
        job = await db.scalar(select(StorageCleanupJob))
        job.not_before = media.utcnow() - timedelta(seconds=1)
        await db.commit()
    monkeypatch.setattr(media, "delete_keys", real_delete)
    await media.cleanup_once()
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(StorageCleanupJob)) == 0


@pytest.mark.asyncio
async def test_failed_db_commit_preserves_original_and_ready_upload(db_env, monkeypatch):
    sessions, ids = db_env
    original = await add(sessions, ids)
    prepared = await prepare(sessions, ids, original["id"])
    async with sessions() as db:
        user = await db.get(User, ids[0])
        async def fail():
            raise OSError("database disconnected before commit")
        monkeypatch.setattr(db, "commit", fail)
        with pytest.raises(OSError):
            await service.mutate_submission(db, user, ids[2], "replace", SubmissionMutation(
                operation_id=uuid.uuid4(), expected_revision=1, upload_id=prepared["uploadId"], title="Replacement",
            ), original["id"])
        await db.rollback()
    async with sessions() as db:
        assert (await db.get(ContestSubmission, original["id"])).url == original["url"]
        assert (await db.get(SubmissionAsset, uuid.UUID(prepared["uploadId"]))).state == "ready"
        assert await db.scalar(select(func.count()).select_from(StorageCleanupJob)) == 0


def test_storage_paths_cannot_escape_upload_directory():
    assert media.image_keys("/uploads/../../important.jpg") == []
    assert media.image_keys("https://unrelated.example/uploads/photo.jpg") == []
    assert media.image_keys("/uploads/a\\..\\photo.jpg") == []
    assert media.image_keys("/uploads/%2e%2e/photo.jpg") == []


def test_image_validation_and_orientation_metadata():
    with pytest.raises(ValueError):
        media.prepare_images(b"not an image")
    ext, exif, variants = media.prepare_images(jpeg_bytes())
    assert ext == ".jpg" and exif == {}
    assert set(variants) == {"original", "thumb", "medium", "full"}


def test_untrusted_exif_cannot_overflow_submission_columns(monkeypatch):
    monkeypatch.setattr(media.storage, "extract_exif_from_bytes", lambda content: {
        "camera": "x" * 500, "focal_length": "y" * 100, "iso": 2 ** 50,
    })
    _, exif, _ = media.prepare_images(jpeg_bytes())
    assert len(exif["camera"]) == 100 and len(exif["focal_length"]) == 50
    assert "iso" not in exif


@pytest.mark.asyncio
async def test_contest_deletion_queues_distinct_linked_gallery_assets(db_env):
    from app.api.contests import delete_contest
    sessions, ids = db_env
    original = await add(sessions, ids)
    async with sessions() as db:
        db.add(GalleryPhoto(url="/uploads/gallery/different.jpg", title="Edited gallery image",
                            photographer="Member", contest_id=ids[2], contest_submission_id=original["id"]))
        await db.commit()
        await delete_contest(ids[2], await db.get(User, ids[0]), db)
    async with sessions() as db:
        urls = set((await db.execute(select(StorageCleanupJob.url))).scalars().all())
        assert urls == {original["url"], "/uploads/gallery/different.jpg"}
        assert await db.scalar(select(func.count()).select_from(GalleryPhoto)) == 0


@pytest.mark.asyncio
async def test_http_workflow_permissions_and_voting_lock(db_env):
    import httpx
    from app.main import app
    from app.api.deps import get_db
    from app.services.auth_service import create_access_token
    sessions, ids = db_env
    async def test_db():
        async with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = test_db
    headers = {"Authorization": "Bearer " + create_access_token(str(ids[0]))}
    other_headers = {"Authorization": "Bearer " + create_access_token(str(ids[1]))}
    base = f"/api/v1/contests/{ids[2]}"
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get(base + "/my-submissions")).status_code == 401
            prepared = await client.post(base + "/submission-uploads", headers=headers,
                                         files={"file": ("test.jpg", jpeg_bytes(), "image/jpeg")})
            assert prepared.status_code == 201, prepared.text
            payload = {"operationId": str(uuid.uuid4()), "uploadId": prepared.json()["uploadId"], "title": "First image"}
            response = await client.post(base + "/submissions", headers=headers, json=payload)
            assert response.status_code == 201, response.text
            sub = response.json()["submission"]
            receipt = await client.get(base + "/submission-operations/" + payload["operationId"], headers=headers)
            assert receipt.json()["state"] == "saved" and "no-store" in receipt.headers["cache-control"]
            assert (await client.get(base + "/submission-operations/" + payload["operationId"], headers=other_headers)).status_code == 404
            assert (await client.delete(base + f"/submissions/{sub['id']}", headers=headers)).status_code == 422
            # A normal member cannot change the contest phase.
            assert (await client.put(base, headers=headers, json={"status": "voting"})).status_code == 403
            async with sessions() as db:
                user = await db.get(User, ids[0])
                user.role = "admin"
                await db.commit()
            voted = await client.put(base, headers=headers, json={"status": "voting"})
            assert voted.status_code == 200, voted.text
            assert voted.json()["canManageSubmissions"] is False
            async with sessions() as db:
                assert (await db.get(Contest, ids[2])).submissions_locked_at is not None
            reopened = await client.put(base, headers=headers, json={"status": "active"})
            assert reopened.status_code == 200 and reopened.json()["canManageSubmissions"] is False
            blocked = await client.patch(base + f"/submissions/{sub['id']}", headers=headers,
                                          json={"operationId": str(uuid.uuid4()), "expectedRevision": 1, "title": "Changed"})
            assert blocked.status_code == 409
            # A previously committed request can still be acknowledged after locking.
            replay = await client.post(base + "/submissions", headers=headers, json=payload)
            assert replay.status_code == 201 and replay.json()["submission"]["id"] == sub["id"]
    finally:
        app.dependency_overrides.clear()
