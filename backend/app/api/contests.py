import math

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.contest import Contest, ContestSubmission, ContestVote
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.contest import (
    ContestCreate,
    ContestResponse,
    ContestSubmissionResponse,
    ContestUpdate,
    ContestWinnerSchema,
    HonorableMentionSchema,
    SubmissionExifSchema,
    VoteRequest,
)
from ..services.storage import save_submission_image
from .deps import get_current_user, get_db, require_admin

router = APIRouter()


def _submission_to_response(sub: ContestSubmission) -> ContestSubmissionResponse:
    exif = None
    if any([sub.exif_camera, sub.exif_focal_length, sub.exif_aperture, sub.exif_shutter_speed, sub.exif_iso]):
        exif = SubmissionExifSchema(
            camera=sub.exif_camera,
            focal_length=sub.exif_focal_length,
            aperture=sub.exif_aperture,
            shutter_speed=sub.exif_shutter_speed,
            iso=sub.exif_iso,
        )
    return ContestSubmissionResponse(
        id=sub.id,
        url=sub.url,
        title=sub.title,
        photographer=sub.photographer,
        votes=sub.vote_count if sub.vote_count else None,
        exif=exif,
    )


def _contest_to_response(contest: Contest) -> ContestResponse:
    submissions = [_submission_to_response(s) for s in contest.submissions]
    submission_count = len(contest.submissions)
    participant_count = len({s.photographer for s in contest.submissions})

    winners = None
    if contest.winners:
        winners = [ContestWinnerSchema.model_validate(w) for w in contest.winners]

    honorable_mentions = None
    if contest.honorable_mentions:
        honorable_mentions = [HonorableMentionSchema.model_validate(w) for w in contest.honorable_mentions]

    return ContestResponse(
        id=contest.id,
        month=contest.month,
        theme=contest.theme,
        description=contest.description,
        status=contest.status,
        deadline=contest.deadline,
        submission_count=submission_count,
        participant_count=participant_count,
        guidelines=contest.guidelines,
        submissions=submissions,
        winners=winners,
        honorable_mentions=honorable_mentions,
    )


# --- Contest CRUD ---


@router.get("/all", response_model=list[ContestResponse])
async def list_all_contests(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contest).order_by(Contest.id))
    contests = result.scalars().unique().all()
    return [_contest_to_response(c) for c in contests]


@router.get("", response_model=PaginatedResponse[ContestResponse])
async def list_contests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(Contest))
    total = count_result.scalar_one()

    result = await db.execute(
        select(Contest).order_by(Contest.id).offset((page - 1) * page_size).limit(page_size)
    )
    contests = result.scalars().unique().all()

    return PaginatedResponse(
        items=[_contest_to_response(c) for c in contests],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_contest(contest_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    return _contest_to_response(contest)


@router.post("", response_model=ContestResponse, status_code=status.HTTP_201_CREATED)
async def create_contest(
    body: ContestCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    contest = Contest(
        month=body.month,
        theme=body.theme,
        description=body.description,
        status=body.status,
        deadline=body.deadline,
        guidelines=body.guidelines,
    )
    db.add(contest)
    await db.commit()
    await db.refresh(contest)
    return _contest_to_response(contest)


@router.put("/{contest_id}", response_model=ContestResponse)
async def update_contest(
    contest_id: int,
    body: ContestUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    if body.month is not None:
        contest.month = body.month
    if body.theme is not None:
        contest.theme = body.theme
    if body.description is not None:
        contest.description = body.description
    if body.status is not None:
        contest.status = body.status
    if body.deadline is not None:
        contest.deadline = body.deadline
    if body.guidelines is not None:
        contest.guidelines = body.guidelines
    if body.winners is not None:
        contest.winners = [w.model_dump(by_alias=True) for w in body.winners]
    if body.honorable_mentions is not None:
        contest.honorable_mentions = [h.model_dump(by_alias=True) for h in body.honorable_mentions]
    await db.commit()
    await db.refresh(contest)
    return _contest_to_response(contest)


@router.delete("/{contest_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contest(
    contest_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    await db.delete(contest)
    await db.commit()


# --- Submissions ---


@router.post("/{contest_id}/submissions", response_model=ContestSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_submission(
    contest_id: int,
    file: UploadFile,
    title: str = Form(...),
    photographer: str = Form(...),
    exif_camera: str | None = Form(None),
    exif_focal_length: str | None = Form(None),
    exif_aperture: str | None = Form(None),
    exif_shutter_speed: str | None = Form(None),
    exif_iso: int | None = Form(None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify contest exists and is active
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    if contest.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contest is not accepting submissions")

    url = await save_submission_image(contest_id, file)

    submission = ContestSubmission(
        contest_id=contest_id,
        url=url,
        title=title,
        photographer=photographer,
        user_id=user.id,
        exif_camera=exif_camera,
        exif_focal_length=exif_focal_length,
        exif_aperture=exif_aperture,
        exif_shutter_speed=exif_shutter_speed,
        exif_iso=exif_iso,
    )
    db.add(submission)
    await db.commit()
    await db.refresh(submission)
    return _submission_to_response(submission)


@router.delete("/{contest_id}/submissions/{submission_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_submission(
    contest_id: int,
    submission_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContestSubmission).where(
            ContestSubmission.id == submission_id,
            ContestSubmission.contest_id == contest_id,
        )
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")
    await db.delete(submission)
    await db.commit()


# --- Voting ---


@router.post("/{contest_id}/vote", status_code=status.HTTP_201_CREATED)
async def cast_vote(
    contest_id: int,
    body: VoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify contest exists and is in voting status
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    if contest.status != "voting":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contest is not in voting phase")

    # Verify submission exists in this contest
    result = await db.execute(
        select(ContestSubmission).where(
            ContestSubmission.id == body.submission_id,
            ContestSubmission.contest_id == contest_id,
        )
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    vote = ContestVote(
        contest_id=contest_id,
        submission_id=body.submission_id,
        user_id=user.id,
    )
    try:
        db.add(vote)
        # Atomically increment vote count
        submission.vote_count = ContestSubmission.vote_count + 1
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already voted in this contest")

    return {"detail": "Vote recorded"}
