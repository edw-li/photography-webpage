import math
from collections import defaultdict

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import case, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.contest import (
    Contest,
    ContestSubmission,
    ContestVote,
    MAX_SUBMISSIONS_PER_USER,
    MAX_VOTES_PER_CATEGORY,
)
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.contest import (
    BatchVoteRequest,
    CategoryVotesSchema,
    ContestCreate,
    ContestResponse,
    ContestSubmissionResponse,
    ContestUpdate,
    ContestWinnerSchema,
    HonorableMentionSchema,
    SubmissionExifSchema,
)
from ..services.storage import delete_uploaded_image, save_submission_image
from .activity import log_activity
from .deps import get_current_user, get_current_user_optional, get_db, require_admin

router = APIRouter()


def _submission_to_response(
    sub: ContestSubmission,
    category_votes: CategoryVotesSchema | None = None,
) -> ContestSubmissionResponse:
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
        category_votes=category_votes,
    )


async def _contest_to_response(
    contest: Contest,
    db: AsyncSession,
    user: User | None = None,
) -> ContestResponse:
    # For completed contests, compute per-submission category vote counts
    sub_category_votes: dict[int, CategoryVotesSchema] = {}
    if contest.status == "completed":
        vote_rows = await db.execute(
            select(
                ContestVote.submission_id,
                ContestVote.category,
                func.count().label("cnt"),
            )
            .where(ContestVote.contest_id == contest.id)
            .group_by(ContestVote.submission_id, ContestVote.category)
        )
        for row in vote_rows:
            sid = row.submission_id
            if sid not in sub_category_votes:
                sub_category_votes[sid] = CategoryVotesSchema()
            setattr(sub_category_votes[sid], row.category, row.cnt)

    submissions = [
        _submission_to_response(s, sub_category_votes.get(s.id))
        for s in contest.submissions
    ]
    submission_count = len(contest.submissions)
    participant_count = len({s.photographer for s in contest.submissions})

    winners = None
    if contest.winners:
        winners = [ContestWinnerSchema.model_validate(w) for w in contest.winners]

    honorable_mentions = None
    if contest.honorable_mentions:
        honorable_mentions = [HonorableMentionSchema.model_validate(w) for w in contest.honorable_mentions]

    # User-specific fields
    user_submission_count = None
    user_has_voted = None
    if user is not None:
        count_result = await db.execute(
            select(func.count()).select_from(ContestSubmission).where(
                ContestSubmission.contest_id == contest.id,
                ContestSubmission.user_id == user.id,
            )
        )
        user_submission_count = count_result.scalar_one()

        vote_exists = await db.execute(
            select(func.count()).select_from(ContestVote).where(
                ContestVote.contest_id == contest.id,
                ContestVote.user_id == user.id,
            )
        )
        user_has_voted = vote_exists.scalar_one() > 0

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
        wildcard_category=contest.wildcard_category,
        submissions=submissions,
        winners=winners,
        honorable_mentions=honorable_mentions,
        user_submission_count=user_submission_count,
        user_has_voted=user_has_voted,
    )


async def _auto_calculate_winners(contest: Contest, db: AsyncSession) -> None:
    """Auto-calculate winners from vote tallies when advancing to completed."""
    vote_rows = await db.execute(
        select(
            ContestVote.category,
            ContestVote.submission_id,
            func.count().label("cnt"),
        )
        .where(ContestVote.contest_id == contest.id)
        .group_by(ContestVote.category, ContestVote.submission_id)
        .order_by(ContestVote.category, func.count().desc())
    )

    # Group by category
    by_category: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for row in vote_rows:
        by_category[row.category].append((row.submission_id, row.cnt))

    winners = []
    honorable_mentions = []
    for category, ranked in by_category.items():
        # Top 3 = winners
        for i, (sub_id, _count) in enumerate(ranked[:3]):
            winners.append({"submissionId": sub_id, "place": i + 1, "category": category})
        # 4th-5th = honorable mentions
        for sub_id, _count in ranked[3:5]:
            honorable_mentions.append({"submissionId": sub_id, "category": category})

    contest.winners = winners if winners else None
    contest.honorable_mentions = honorable_mentions if honorable_mentions else None

    # Update total vote_count on each submission
    total_votes: dict[int, int] = defaultdict(int)
    for category, ranked in by_category.items():
        for sub_id, count in ranked:
            total_votes[sub_id] += count

    for sub in contest.submissions:
        sub.vote_count = total_votes.get(sub.id, 0)


# --- Contest CRUD ---


@router.get("/all", response_model=list[ContestResponse])
async def list_all_contests(
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    status_order = case(
        (Contest.status == "active", 0),
        (Contest.status == "voting", 1),
        (Contest.status == "completed", 2),
        else_=3,
    )
    result = await db.execute(select(Contest).order_by(status_order, Contest.deadline.asc()))
    contests = result.scalars().unique().all()
    return [await _contest_to_response(c, db, user) for c in contests]


@router.get("", response_model=PaginatedResponse[ContestResponse])
async def list_contests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    count_result = await db.execute(select(func.count()).select_from(Contest))
    total = count_result.scalar_one()

    status_order = case(
        (Contest.status == "active", 0),
        (Contest.status == "voting", 1),
        (Contest.status == "completed", 2),
        else_=3,
    )
    result = await db.execute(
        select(Contest).order_by(status_order, Contest.deadline.asc()).offset((page - 1) * page_size).limit(page_size)
    )
    contests = result.scalars().unique().all()

    return PaginatedResponse(
        items=[await _contest_to_response(c, db) for c in contests],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/{contest_id}", response_model=ContestResponse)
async def get_contest(
    contest_id: int,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    return await _contest_to_response(contest, db, user)


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
        wildcard_category=body.wildcard_category,
    )
    db.add(contest)
    await log_activity(db, admin, "create", "contest", body.theme, f"Created contest: {body.theme}")
    await db.commit()
    await db.refresh(contest)
    return await _contest_to_response(contest, db, admin)


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

    old_status = contest.status

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
    if "wildcard_category" in body.model_fields_set:
        contest.wildcard_category = body.wildcard_category

    # Auto-calculate winners when advancing from voting to completed
    if old_status == "voting" and contest.status == "completed":
        await _auto_calculate_winners(contest, db)

    # Clear winners when reverting from completed
    if old_status == "completed" and contest.status in ("voting", "active"):
        contest.winners = None
        contest.honorable_mentions = None
        for sub in contest.submissions:
            sub.vote_count = 0

    await log_activity(db, admin, "update", "contest", str(contest_id), f"Updated contest: {contest.theme}")
    await db.commit()
    await db.refresh(contest)
    return await _contest_to_response(contest, db, admin)


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
    for sub in contest.submissions:
        delete_uploaded_image(sub.url)
    await log_activity(db, admin, "delete", "contest", str(contest_id), f"Deleted contest: {contest.theme}")
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

    # Enforce submission limit
    count_result = await db.execute(
        select(func.count()).select_from(ContestSubmission).where(
            ContestSubmission.contest_id == contest_id,
            ContestSubmission.user_id == user.id,
        )
    )
    if count_result.scalar_one() >= MAX_SUBMISSIONS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum {MAX_SUBMISSIONS_PER_USER} submissions per person",
        )

    url = await save_submission_image(contest.month, file)

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
    delete_uploaded_image(submission.url)
    await db.delete(submission)
    await db.commit()


# --- Voting ---


@router.post("/{contest_id}/vote", status_code=status.HTTP_201_CREATED)
async def cast_vote(
    contest_id: int,
    body: BatchVoteRequest,
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

    # Check if user has already voted
    existing = await db.execute(
        select(func.count()).select_from(ContestVote).where(
            ContestVote.contest_id == contest_id,
            ContestVote.user_id == user.id,
        )
    )
    if existing.scalar_one() > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already voted in this contest")

    # Determine valid categories for this contest
    valid_categories = {"theme", "favorite"}
    if contest.wildcard_category:
        valid_categories.add("wildcard")

    # Get all submission IDs for this contest
    sub_result = await db.execute(
        select(ContestSubmission.id).where(ContestSubmission.contest_id == contest_id)
    )
    valid_sub_ids = {row[0] for row in sub_result}

    # Validate and create votes
    votes_to_add = []
    for cat_vote in body.votes:
        if cat_vote.category not in valid_categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid category: {cat_vote.category}",
            )
        if len(cat_vote.submission_ids) > MAX_VOTES_PER_CATEGORY:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Maximum {MAX_VOTES_PER_CATEGORY} votes per category",
            )
        if len(cat_vote.submission_ids) < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 1 vote required per category",
            )
        if len(set(cat_vote.submission_ids)) != len(cat_vote.submission_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Duplicate submission IDs in category",
            )
        for sub_id in cat_vote.submission_ids:
            if sub_id not in valid_sub_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Submission {sub_id} not found in this contest",
                )
            votes_to_add.append(
                ContestVote(
                    contest_id=contest_id,
                    submission_id=sub_id,
                    user_id=user.id,
                    category=cat_vote.category,
                )
            )

    try:
        for vote in votes_to_add:
            db.add(vote)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vote conflict detected")

    return {"detail": "Votes recorded"}
