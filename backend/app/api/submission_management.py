import uuid

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .deps import get_current_user, get_db
from ..models.contest import Contest
from ..models.submission_asset import SubmissionAsset, SubmissionOperation
from ..models.user import User
from ..rate_limit import AUTH_ATTEMPT, SOCIAL_ACTION, limiter
from ..schemas.contest import SubmissionMutation
from ..services.submission_management import lock_reason, mutate_submission, prepare_upload, snapshot
from ..services.submission_storage import queue_cleanup

router = APIRouter()


@router.get("/{contest_id}/my-submissions")
async def my_submissions(contest_id: int, response: Response,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    contest = await db.get(Contest, contest_id)
    if contest is None:
        raise HTTPException(404, "Contest not found")
    response.headers["Cache-Control"] = "private, no-store"
    own = [snapshot(s) for s in contest.submissions if s.user_id == user.id]
    reason = lock_reason(contest)
    return {"submissions": own, "userSubmissionCount": len(own),
            "canManageSubmissions": reason is None, "submissionLockReason": reason,
            "deadline": contest.deadline, "status": contest.status}


@router.post("/{contest_id}/submission-uploads", status_code=201)
@limiter.limit(AUTH_ATTEMPT)
async def prepare_submission_upload(request: Request, contest_id: int, file: UploadFile,
                                    target_submission_id: int | None = Form(None),
                                    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await prepare_upload(db, user, contest_id, file, target_submission_id)


@router.delete("/{contest_id}/submission-uploads/{upload_id}", status_code=204)
async def discard_submission_upload(contest_id: int, upload_id: uuid.UUID,
                                    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    asset = (await db.execute(select(SubmissionAsset).where(
        SubmissionAsset.id == upload_id, SubmissionAsset.owner_id == user.id,
        SubmissionAsset.contest_id == contest_id,
    ).with_for_update())).scalar_one_or_none()
    if asset and asset.state in ("uploading", "ready", "failed"):
        asset.state = "failed"
        await queue_cleanup(db, asset.url)
        await db.commit()


@router.post("/{contest_id}/submissions", status_code=201)
@limiter.limit(SOCIAL_ACTION)
async def add_submission(request: Request, contest_id: int,
                         user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Existing open browser sessions can still submit their original multipart form.
    if request.headers.get("content-type", "").startswith("multipart/form-data"):
        form = await request.form()
        file = form.get("file")
        if file is None or not hasattr(file, "read"):
            raise HTTPException(422, "Choose a photo.")
        try:
            body = SubmissionMutation(operation_id=uuid.uuid4(), title=form.get("title"))
        except ValueError:
            raise HTTPException(422, "Give your photo a title of up to 300 characters.") from None
        prepared = await prepare_upload(db, user, contest_id, file, None)
        body.upload_id = uuid.UUID(prepared["uploadId"])
        result = await mutate_submission(db, user, contest_id, "add", body)
        return result["submission"]
    try:
        body = SubmissionMutation.model_validate(await request.json())
    except ValueError:
        raise HTTPException(422, "A valid request ID, prepared photo, and title are required.") from None
    return await mutate_submission(db, user, contest_id, "add", body)


@router.put("/{contest_id}/submissions/{submission_id}")
@limiter.limit(SOCIAL_ACTION)
async def replace_submission(request: Request, contest_id: int, submission_id: int, body: SubmissionMutation,
                            user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await mutate_submission(db, user, contest_id, "replace", body, submission_id)


@router.patch("/{contest_id}/submissions/{submission_id}")
@limiter.limit(SOCIAL_ACTION)
async def edit_submission_title(request: Request, contest_id: int, submission_id: int, body: SubmissionMutation,
                                user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await mutate_submission(db, user, contest_id, "title", body, submission_id)


@router.get("/{contest_id}/submission-operations/{operation_id}")
async def submission_operation(contest_id: int, operation_id: uuid.UUID, response: Response,
                               user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "private, no-store"
    receipt = await db.get(SubmissionOperation, operation_id)
    if receipt is None:
        return {"state": "unknown"}
    if receipt.user_id != user.id or receipt.contest_id != contest_id:
        raise HTTPException(404, "Operation not found")
    return {"state": "saved", "result": receipt.result}
