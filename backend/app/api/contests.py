import asyncio
import calendar
import math
import mimetypes
import uuid
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import case, select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .gallery import auto_like_photo_owner, validate_image_upload, _delete_notifications_for_photo
from ..models.contest import (
    Contest,
    ContestSubmission,
    ContestVote,
    MAX_SUBMISSIONS_PER_USER,
    MAX_VOTES_PER_CATEGORY,
    THEME_RANKS,
    VOTING_FORMAT_CLASSIC,
    VOTING_FORMAT_POINTS,
)
from ..models.event import Event
from ..models.notification import (
    NOTIFICATION_TYPE_CONTEST_COMPLETED,
    NOTIFICATION_TYPE_CONTEST_VOTING_OPEN,
    Notification,
)
from ..models.user import User
from ..schemas.common import PaginatedResponse
from ..schemas.contest import (
    BatchVoteRequest,
    CategoryResultSchema,
    CategoryVotesSchema,
    ContestCreate,
    ContestResponse,
    ContestSubmissionResponse,
    ContestUpdate,
    ContestWinnerSchema,
    FinalizeContestRequest,
    LeaderboardRankingSchema,
    LiveTalliesResponse,
    LiveTallySchema,
    MyResultsContestSchema,
    MyResultsLeaderboardSchema,
    MyResultsResponseSchema,
    MyResultsStatsSchema,
    OverallResultSchema,
    PointsBallotRequest,
    PointsScoreSchema,
    PointsSubmissionResultSchema,
    SubmissionAssignRequest,
    SubmissionExifSchema,
    SubmissionResultSchema,
    SubmissionMutation,
)
from ..models.gallery import GalleryPhoto
from ..models.member import Member
from ..services.storage import extract_exif_from_bytes, make_photographer_slug, read_image_bytes, save_submission_image
from .activity import log_activity
from .deps import get_current_user, get_current_user_optional, get_db, require_admin
from ..services.points_scoring import OVERALL_CATEGORY, PointsScore, points_winners, rescore, snapshot
from ..services.points_voting import (
    load_points_scores, points_results, points_results_by_contest, stored_points_scores,
)
from ..services.submission_management import lock_contest, lock_reason, mutate_submission
from ..services.submission_storage import queue_cleanup

router = APIRouter()


def _points_score_schema(score: PointsScore) -> PointsScoreSchema:
    return PointsScoreSchema(
        total=score.total,
        theme_points=score.theme_points,
        theme_first=score.theme_first,
        theme_second=score.theme_second,
        theme_third=score.theme_third,
        favorite=score.favorite,
        bonus=score.bonus,
        rank=score.rank,
        tiebreak=score.tiebreak,
    )


def _submission_to_response(
    sub: ContestSubmission,
    category_votes: CategoryVotesSchema | None = None,
    anonymize: bool = False,
    current_user_id: uuid.UUID | None = None,
    score: PointsScoreSchema | None = None,
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
    if anonymize:
        # Route the image through the API proxy so the storage path (which
        # contains the photographer's name slug) never reaches the client.
        # Submission time is withheld too — it could hint at who submitted.
        url = f"/api/v1/contests/{sub.contest_id}/submissions/{sub.id}/image?v={sub.revision}"
        photographer = ""
        created_at = None
    else:
        url = sub.url
        photographer = sub.photographer
        created_at = sub.created_at
    is_own = current_user_id is not None and sub.user_id == current_user_id
    return ContestSubmissionResponse(
        id=sub.id,
        url=url,
        title=sub.title,
        photographer=photographer,
        is_assigned=sub.user_id is not None,
        is_own=is_own,
        votes=sub.vote_count if sub.vote_count else None,
        exif=exif,
        category_votes=category_votes,
        score=score,
        created_at=created_at,
        revision=sub.revision,
        updated_at=None if anonymize else sub.updated_at,
        image_submitted_at=None if anonymize else sub.image_submitted_at,
    )


async def _classic_vote_counts(db: AsyncSession, contest_id: int) -> dict[int, CategoryVotesSchema]:
    """Per-submission category vote counts from a classic contest's ballots
    (submissions without votes are absent)."""
    vote_rows = await db.execute(
        select(
            ContestVote.submission_id,
            ContestVote.category,
            func.count().label("cnt"),
        )
        .where(ContestVote.contest_id == contest_id)
        .group_by(ContestVote.submission_id, ContestVote.category)
    )
    counts: dict[int, CategoryVotesSchema] = {}
    for row in vote_rows:
        sid = row.submission_id
        if sid not in counts:
            counts[sid] = CategoryVotesSchema()
        setattr(counts[sid], row.category, row.cnt)
    return counts


async def _contest_to_response(
    contest: Contest,
    db: AsyncSession,
    user: User | None = None,
) -> ContestResponse:
    # For completed contests, attach each submission's tally: per-category vote
    # counts (classic) or the points breakdown (points).
    sub_category_votes: dict[int, CategoryVotesSchema] = {}
    sub_scores: dict[int, PointsScoreSchema] = {}
    if contest.status == "completed":
        if contest.voting_format == VOTING_FORMAT_POINTS:
            for score in await points_results(db, contest):
                sub_scores[score.submission_id] = _points_score_schema(score)
        elif contest.is_imported:
            # Imported contests: read tallies from JSONB on each submission
            for sub in contest.submissions:
                if sub.category_vote_tallies:
                    sub_category_votes[sub.id] = CategoryVotesSchema(
                        theme=sub.category_vote_tallies.get("theme", 0),
                        favorite=sub.category_vote_tallies.get("favorite", 0),
                        wildcard=sub.category_vote_tallies.get("wildcard", 0),
                    )
        else:
            # Organic contests: aggregate from ContestVote table
            sub_category_votes = await _classic_vote_counts(db, contest.id)

    is_admin = user is not None and user.role == "admin"
    anonymize = contest.status == "voting" and not is_admin
    current_user_id = user.id if user is not None else None
    submissions = [
        _submission_to_response(
            s,
            sub_category_votes.get(s.id),
            anonymize=anonymize,
            current_user_id=current_user_id,
            score=sub_scores.get(s.id),
        )
        for s in contest.submissions
    ]
    submission_count = len(contest.submissions)
    participant_count = len({s.photographer for s in contest.submissions})

    winners = None
    if contest.winners:
        winners = [ContestWinnerSchema.model_validate(w) for w in contest.winners]

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
        is_imported=contest.is_imported,
        voting_format=contest.voting_format,
        submissions=submissions,
        winners=winners,
        user_submission_count=user_submission_count,
        user_has_voted=user_has_voted,
        can_manage_submissions=user is not None and lock_reason(contest) is None,
        submission_lock_reason=lock_reason(contest),
    )


def _rank_for_category(
    entries: list[tuple[int, int, datetime]],
    category: str,
) -> list[dict]:
    """Assign dense ranks for one category.

    *entries* is a list of ``(submission_id, vote_count, created_at)`` tuples
    with positive vote counts. Every submission whose tally is among the top
    three distinct vote counts places; ties share the place, so a category
    may have several firsts, seconds, or thirds. Within a place, earlier
    submissions come first in the returned list.
    """
    if not entries:
        return []

    # Sort: most votes first, earliest submission first within a tie
    entries.sort(key=lambda x: (-x[1], x[2]))

    winners: list[dict] = []
    place = 0
    prev_votes: int | None = None
    for sub_id, votes, _created in entries:
        if votes != prev_votes:
            place += 1
            prev_votes = votes
        if place > 3:
            break
        winners.append({"submissionId": sub_id, "place": place, "category": category})
    return winners


async def _auto_calculate_winners(contest: Contest, db: AsyncSession) -> None:
    """Calculate winners from the recorded ballots, under the contest's own
    voting format (classic contests never get re-scored as points)."""
    if contest.voting_format == VOTING_FORMAT_POINTS:
        await _calculate_points_winners(contest, db)
    else:
        await _calculate_classic_winners(contest, db)


async def _calculate_points_winners(
    contest: Contest, db: AsyncSession, *, rescore_stored: bool = False,
) -> None:
    """One leaderboard: the podium is stored as category "overall"; each
    submission keeps its total in ``vote_count`` and its whole result frozen
    in ``points_score``, so later ballot changes (a deleted member's votes
    cascade away) can't rewrite a finished contest.

    With *rescore_stored* (Recalculate Winners), the frozen results are
    re-ranked under the current rules instead of re-reading the ballots.
    """
    stored = stored_points_scores(contest) if rescore_stored else None
    if stored is not None:
        scores = rescore(stored, count_bonus=bool(contest.wildcard_category))
    else:
        scores = await load_points_scores(db, contest)
    winners = points_winners(scores)
    contest.winners = winners if winners else None
    contest.honorable_mentions = None
    by_id = {score.submission_id: score for score in scores}
    for sub in contest.submissions:
        score = by_id.get(sub.id)
        sub.vote_count = score.total if score else 0
        sub.points_score = snapshot(score) if score else None


async def _calculate_classic_winners(contest: Contest, db: AsyncSession) -> None:
    """Three category podiums from approval votes (dense ranking per category)."""
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

    # Build created_at lookup for tie ordering
    sub_created = {sub.id: getattr(sub, "image_submitted_at", sub.created_at) for sub in contest.submissions}

    winners = []
    for category, ranked in by_category.items():
        entries = [(sub_id, cnt, sub_created[sub_id]) for sub_id, cnt in ranked]
        winners.extend(_rank_for_category(entries, category))

    contest.winners = winners if winners else None
    contest.honorable_mentions = None

    # Update total vote_count on each submission
    total_votes: dict[int, int] = defaultdict(int)
    for category, ranked in by_category.items():
        for sub_id, count in ranked:
            total_votes[sub_id] += count

    for sub in contest.submissions:
        sub.vote_count = total_votes.get(sub.id, 0)


def _winners_from_tallies(contest: Contest) -> list[dict]:
    """Compute dense-rank winners from stored per-submission vote tallies.

    Used for imported contests, whose tallies are entered by an admin at
    finalize time and persisted on each submission. Zero tallies never place,
    and the wildcard category only counts when the contest defines one.
    """
    by_category: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for sub in contest.submissions:
        tallies = sub.category_vote_tallies or {}
        for category in ("theme", "favorite", "wildcard"):
            if category == "wildcard" and not contest.wildcard_category:
                continue
            count = tallies.get(category, 0) or 0
            if count > 0:
                by_category[category].append((sub.id, count))

    sub_created = {sub.id: getattr(sub, "image_submitted_at", sub.created_at) for sub in contest.submissions}
    winners: list[dict] = []
    for category, ranked in by_category.items():
        entries = [(sub_id, cnt, sub_created[sub_id]) for sub_id, cnt in ranked]
        winners.extend(_rank_for_category(entries, category))
    return winners


async def _populate_gallery_from_contest(
    contest: Contest, db: AsyncSession, update_winners: bool = False,
) -> None:
    """Create gallery entries for contest submissions after completion.

    When *update_winners* is True (used by finalize/re-finalize), existing
    gallery entries also get their winner status refreshed instead of being
    skipped.
    """
    # Build winner map: submission_id -> (best_place, best_category)
    winner_map: dict[int, tuple[int, str]] = {}
    # Build full placements map: submission_id -> [{place, category}, ...]
    all_placements: dict[int, list[dict]] = defaultdict(list)
    if contest.winners:
        for w in contest.winners:
            sid = w["submissionId"]
            place = w["place"]
            cat = w.get("category", "theme")
            all_placements[sid].append({"place": place, "category": cat, "month": contest.month})
            if sid not in winner_map or place < winner_map[sid][0]:
                winner_map[sid] = (place, cat)

    # Find existing gallery entries for this contest
    existing_result = await db.execute(
        select(GalleryPhoto).where(
            GalleryPhoto.contest_id == contest.id,
            GalleryPhoto.contest_submission_id.isnot(None),
        )
    )
    existing_photos = {gp.contest_submission_id: gp for gp in existing_result.scalars().all()}

    # Resolve member_id for submissions that have a user_id
    member_by_user: dict[str, int] = {}
    user_ids = [str(sub.user_id) for sub in contest.submissions if sub.user_id]
    if user_ids:
        member_result = await db.execute(
            select(Member.user_id, Member.id).where(Member.user_id.in_(user_ids))
        )
        for row in member_result:
            member_by_user[str(row.user_id)] = row.id

    # Collect newly created photos so we can auto-like them in one pass after
    # flushing — flushing populates photo.id, which the like row needs.
    new_photos: list[tuple[GalleryPhoto, uuid.UUID | None]] = []

    for sub in contest.submissions:
        is_winner = sub.id in winner_map
        place, category = winner_map[sub.id] if is_winner else (None, None)
        placements = all_placements.get(sub.id) or None
        member_id = member_by_user.get(str(sub.user_id)) if sub.user_id else None

        if sub.id in existing_photos:
            if update_winners:
                gp = existing_photos[sub.id]
                gp.is_winner = is_winner
                gp.winner_place = place
                gp.winner_category = category
                gp.winner_placements = placements
                gp.photographer = sub.photographer
                gp.member_id = member_id
            continue

        photo = GalleryPhoto(
            url=sub.url,
            title=sub.title,
            photographer=sub.photographer,
            member_id=member_id,
            exif_camera=sub.exif_camera,
            exif_focal_length=sub.exif_focal_length,
            exif_iso=sub.exif_iso,
            exif_aperture=sub.exif_aperture,
            exif_shutter_speed=sub.exif_shutter_speed,
            contest_id=contest.id,
            contest_submission_id=sub.id,
            is_winner=is_winner,
            winner_place=place,
            winner_category=category,
            winner_placements=placements,
        )
        db.add(photo)
        # We already know the owner's user_id from the submission — pass it
        # directly so the helper can skip the Member lookup it would otherwise
        # do via photo.member_id.
        new_photos.append((photo, sub.user_id))

    if new_photos:
        await db.flush()  # populate photo.id for each newly added photo
        for photo, owner_user_id in new_photos:
            await auto_like_photo_owner(photo, db, owner_user_id=owner_user_id)


# --- Auto-scheduled deadline events ---

CONTEST_EVENT_TIME = "23:59"
CONTEST_EVENT_LOCATION = "Online"
# Voting runs the first week of the month after the contest month, ending at
# end of day on this date. Keep in sync with getVotingDeadline() in
# src/pages/ContestPage.tsx.
VOTING_DEADLINE_DAY = 7


def _parse_contest_month(month_str: str) -> tuple[int, int]:
    """Parse 'YYYY-MM' into (year, month)."""
    year_part, month_part = month_str.split("-", 1)
    return int(year_part), int(month_part)


def _format_contest_month(month_str: str) -> str:
    """Return a human-readable month phrase like 'March 2026' from '2026-03'."""
    year, month = _parse_contest_month(month_str)
    return date(year, month, 1).strftime("%B %Y")


def _submission_deadline_date(month_str: str) -> str:
    """Return YYYY-MM-DD for the last day of the contest month."""
    year, month = _parse_contest_month(month_str)
    last_day = calendar.monthrange(year, month)[1]
    return f"{year:04d}-{month:02d}-{last_day:02d}"


def _voting_deadline_date(month_str: str) -> str:
    """Return YYYY-MM-DD for the 7th of the next month, with year wrap."""
    year, month = _parse_contest_month(month_str)
    next_year = year + 1 if month == 12 else year
    next_month = 1 if month == 12 else month + 1
    return f"{next_year:04d}-{next_month:02d}-{VOTING_DEADLINE_DAY:02d}"


def _contest_begins_date(month_str: str) -> str:
    """Return YYYY-MM-DD for the 1st of the contest month."""
    year, month = _parse_contest_month(month_str)
    return f"{year:04d}-{month:02d}-01"


def _submission_event_id(contest_id: int) -> str:
    return f"contest-{contest_id}-submission-deadline"


def _voting_event_id(contest_id: int) -> str:
    return f"contest-{contest_id}-voting-deadline"


def _contest_begins_event_id(contest_id: int) -> str:
    return f"contest-{contest_id}-begins"


def _build_submission_event_fields(contest: Contest) -> dict:
    month_phrase = _format_contest_month(contest.month)
    return {
        "title": f"Submission Deadline — {contest.theme}",
        "description": (
            f"Last day to submit photos for the {month_phrase} contest. "
            "Submissions close at 11:59 PM."
        ),
        "location": CONTEST_EVENT_LOCATION,
        "date": _submission_deadline_date(contest.month),
        "time": CONTEST_EVENT_TIME,
        "end_time": None,
        "recurrence": None,
    }


def _build_voting_event_fields(contest: Contest) -> dict:
    month_phrase = _format_contest_month(contest.month)
    return {
        "title": f"Voting Deadline — {contest.theme}",
        "description": (
            f"Last day to vote in the {month_phrase} contest. "
            "Voting closes at 11:59 PM."
        ),
        "location": CONTEST_EVENT_LOCATION,
        "date": _voting_deadline_date(contest.month),
        "time": CONTEST_EVENT_TIME,
        "end_time": None,
        "recurrence": None,
    }


def _build_contest_begins_event_fields(contest: Contest) -> dict:
    year, month = _parse_contest_month(contest.month)
    month_name = date(year, month, 1).strftime("%B")
    return {
        "title": f"{month_name} Photo Contest Begins",
        "description": (
            f"Join us for the {month_name} Monthly Photo Contest! "
            'Visit the "Contest" Page for more details.'
        ),
        "location": CONTEST_EVENT_LOCATION,
        "date": _contest_begins_date(contest.month),
        "time": "00:00",
        "end_time": None,
        "recurrence": None,
    }


async def _create_contest_events(contest: Contest, db: AsyncSession) -> None:
    """Insert deadline events for a newly created contest.

    No-op for contests created in 'completed' status (imported past contests).
    Defensive: if a deterministic ID already exists in the events table for
    any reason, skip creating that one rather than raising IntegrityError.
    """
    if contest.status == "completed":
        return

    sub_id = _submission_event_id(contest.id)
    vote_id = _voting_event_id(contest.id)
    begins_id = _contest_begins_event_id(contest.id)

    existing = await db.execute(
        select(Event.id).where(Event.id.in_([sub_id, vote_id, begins_id]))
    )
    existing_ids = {row[0] for row in existing}

    if begins_id not in existing_ids:
        db.add(Event(id=begins_id, **_build_contest_begins_event_fields(contest)))
    if sub_id not in existing_ids:
        db.add(Event(id=sub_id, **_build_submission_event_fields(contest)))
    if vote_id not in existing_ids:
        db.add(Event(id=vote_id, **_build_voting_event_fields(contest)))


async def _update_contest_events(contest: Contest, db: AsyncSession) -> None:
    """Refresh existing deadline events when a contest is edited.

    - Only updates events that already exist (respects manual deletes, and
      respects 'no auto-create for imported contests' — since they were never
      created, they aren't retroactively created here either).
    - No-op while the contest is in 'completed' status: deadlines are now
      historical, leave them as-is.
    """
    if contest.status == "completed":
        return

    sub_id = _submission_event_id(contest.id)
    vote_id = _voting_event_id(contest.id)
    begins_id = _contest_begins_event_id(contest.id)

    result = await db.execute(
        select(Event).where(Event.id.in_([sub_id, vote_id, begins_id]))
    )
    by_id = {ev.id: ev for ev in result.scalars().all()}

    if begins_id in by_id:
        fields = _build_contest_begins_event_fields(contest)
        ev = by_id[begins_id]
        ev.title = fields["title"]
        ev.description = fields["description"]
        ev.location = fields["location"]
        ev.date = fields["date"]
        ev.time = fields["time"]
        ev.end_time = fields["end_time"]

    if sub_id in by_id:
        fields = _build_submission_event_fields(contest)
        ev = by_id[sub_id]
        ev.title = fields["title"]
        ev.description = fields["description"]
        ev.location = fields["location"]
        ev.date = fields["date"]
        ev.time = fields["time"]
        ev.end_time = fields["end_time"]

    if vote_id in by_id:
        fields = _build_voting_event_fields(contest)
        ev = by_id[vote_id]
        ev.title = fields["title"]
        ev.description = fields["description"]
        ev.location = fields["location"]
        ev.date = fields["date"]
        ev.time = fields["time"]
        ev.end_time = fields["end_time"]


async def _delete_contest_events(contest_id: int, db: AsyncSession) -> None:
    """Remove auto-events linked to a contest. Idempotent."""
    sub_id = _submission_event_id(contest_id)
    vote_id = _voting_event_id(contest_id)
    begins_id = _contest_begins_event_id(contest_id)
    result = await db.execute(
        select(Event).where(Event.id.in_([sub_id, vote_id, begins_id]))
    )
    for ev in result.scalars().all():
        await db.delete(ev)


# --- Notifications for contest transitions ---


async def _notify_submitters_for_contest_transition(
    contest: Contest,
    notification_type: str,
    db: AsyncSession,
) -> None:
    """Insert a notification for each unique submitter (with a linked user) of this contest.

    Idempotent per (user_id, type, contestId): if a matching notification already
    exists, it is not duplicated. This protects against admins toggling status
    voting → active → voting and emitting duplicate batches.
    """
    submitter_user_ids = {
        sub.user_id for sub in contest.submissions if sub.user_id is not None
    }
    if not submitter_user_ids:
        return

    # Find which submitters already have a notification of this type for this contest
    existing_result = await db.execute(
        select(Notification.user_id).where(
            Notification.type == notification_type,
            Notification.user_id.in_(submitter_user_ids),
            Notification.payload["contestId"].astext == str(contest.id),
        )
    )
    already_notified = {row[0] for row in existing_result}
    targets = submitter_user_ids - already_notified
    if not targets:
        return

    payload = {
        "contestId": contest.id,
        "contestTheme": contest.theme,
        "contestMonth": contest.month,
    }
    for uid in targets:
        db.add(Notification(
            user_id=uid,
            type=notification_type,
            payload=payload,
        ))


# --- Contest CRUD ---


@router.get("/all", response_model=list[ContestResponse])
async def list_all_contests(
    limit: int = Query(200, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    # "voting" sorts first: it is the most time-sensitive state (roughly a
    # one-week window each month), so contest listings lead with it.
    status_order = case(
        (Contest.status == "voting", 0),
        (Contest.status == "upcoming", 1),
        (Contest.status == "active", 2),
        (Contest.status == "completed", 3),
        else_=4,
    )
    result = await db.execute(
        select(Contest)
        .order_by(
            status_order,
            case((Contest.status == "completed", Contest.deadline), else_=None).desc(),
            Contest.deadline.asc(),
        )
        .limit(limit)
    )
    contests = result.scalars().unique().all()
    return [await _contest_to_response(c, db, user) for c in contests]


@router.get("", response_model=PaginatedResponse[ContestResponse])
async def list_contests(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: str | None = Query(None, alias="status"),
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_current_user_optional),
):
    count_query = select(func.count()).select_from(Contest)
    if status_filter:
        count_query = count_query.where(Contest.status == status_filter)
    count_result = await db.execute(count_query)
    total = count_result.scalar_one()

    # Keep in step with list_all_contests: "voting" leads (see comment there).
    status_order = case(
        (Contest.status == "voting", 0),
        (Contest.status == "upcoming", 1),
        (Contest.status == "active", 2),
        (Contest.status == "completed", 3),
        else_=4,
    )
    query = select(Contest)
    if status_filter:
        query = query.where(Contest.status == status_filter)
    result = await db.execute(
        query
        .order_by(
            status_order,
            case((Contest.status == "completed", Contest.deadline), else_=None).desc(),
            Contest.deadline.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    contests = result.scalars().unique().all()

    return PaginatedResponse(
        items=[await _contest_to_response(c, db, user) for c in contests],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total > 0 else 0,
    )


@router.get("/my-results", response_model=MyResultsResponseSchema)
async def get_my_results(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's competition performance and submission history.

    Medal counts build on history: classic contests contribute their category
    placements and points contests their overall leaderboard placement. Votes
    earned and best category come from classic contests only; points and #1
    theme votes from points contests only.
    """
    result = await db.execute(
        select(Contest)
        .where(Contest.status == "completed")
        .order_by(Contest.month.desc())
    )
    completed = result.scalars().unique().all()
    points_scores = await points_results_by_contest(
        db, [c for c in completed if c.voting_format == VOTING_FORMAT_POINTS],
    )

    # Build per-user stats across all completed contests
    all_user_stats: dict[str, dict] = defaultdict(
        lambda: {"first": 0, "second": 0, "third": 0, "podium": 0,
                 "overall_first": 0, "overall_second": 0, "overall_third": 0,
                 "votes": 0, "points": 0, "first_choice": 0,
                 "submissions": 0, "contests": set(), "cat_wins": defaultdict(int),
                 "has_classic": False, "has_points": False}
    )
    place_keys = {1: "first", 2: "second", 3: "third"}

    for contest in completed:
        is_points = contest.voting_format == VOTING_FORMAT_POINTS
        scores = points_scores.get(contest.id, {})
        sub_to_user: dict[int, str] = {}
        for sub in contest.submissions:
            if not sub.user_id:
                continue
            uid = str(sub.user_id)
            sub_to_user[sub.id] = uid
            entry = all_user_stats[uid]
            entry["submissions"] += 1
            entry["contests"].add(contest.id)
            if is_points:
                entry["has_points"] = True
                score = scores.get(sub.id)
                if score is not None:
                    entry["points"] += score.total
                    entry["first_choice"] += score.theme_first
            else:
                entry["has_classic"] = True
                entry["votes"] += sub.vote_count

        for w in contest.winners or []:
            uid = sub_to_user.get(w["submissionId"])
            if not uid:
                continue
            entry = all_user_stats[uid]
            key = place_keys.get(w["place"])
            if key:
                entry[key] += 1
            entry["podium"] += 1
            category = w.get("category", "theme")
            if category == OVERALL_CATEGORY:
                if key:
                    entry["overall_" + key] += 1
            else:
                entry["cat_wins"][category] += 1

    my_uid = str(user.id)
    my = all_user_stats.get(my_uid)
    total_completed = len(completed)
    total_members = len(all_user_stats)

    if my:
        contests_entered = len(my["contests"])
        cat_wins = my["cat_wins"]
        best_cat = max(cat_wins, key=cat_wins.get) if cat_wins else None
        stats = MyResultsStatsSchema(
            total_submissions=my["submissions"],
            total_votes=my["votes"],
            first_place_finishes=my["first"],
            second_place_finishes=my["second"],
            third_place_finishes=my["third"],
            podium_finishes=my["podium"],
            contests_entered=contests_entered,
            total_completed_contests=total_completed,
            participation_rate=round(contests_entered / total_completed, 4) if total_completed else 0.0,
            best_category=best_cat,
            overall_first_place_finishes=my["overall_first"],
            overall_second_place_finishes=my["overall_second"],
            overall_third_place_finishes=my["overall_third"],
            total_points=my["points"],
            first_choice_votes=my["first_choice"],
            has_classic_results=my["has_classic"],
            has_points_results=my["has_points"],
        )
    else:
        stats = MyResultsStatsSchema(
            total_submissions=0, total_votes=0,
            first_place_finishes=0, second_place_finishes=0, third_place_finishes=0,
            podium_finishes=0, contests_entered=0,
            total_completed_contests=total_completed, participation_rate=0.0,
            best_category=None,
        )

    # Leaderboard rankings (competition-style)
    def _compute_rank(key: str) -> LeaderboardRankingSchema:
        if not all_user_stats or my_uid not in all_user_stats:
            return LeaderboardRankingSchema(value=0, rank=total_members + 1, total_members=total_members)
        my_val = all_user_stats[my_uid][key]
        rank = 1 + sum(1 for s in all_user_stats.values() if s[key] > my_val)
        return LeaderboardRankingSchema(value=my_val, rank=rank, total_members=total_members)

    leaderboard = MyResultsLeaderboardSchema(
        first_place=_compute_rank("first"),
        second_place=_compute_rank("second"),
        third_place=_compute_rank("third"),
        total_podium=_compute_rank("podium"),
        total_votes=_compute_rank("votes"),
        total_points=_compute_rank("points"),
        first_choice_votes=_compute_rank("first_choice"),
    )

    # Per-contest results for the current user
    def _sub_exif(sub: ContestSubmission) -> SubmissionExifSchema | None:
        if any([sub.exif_camera, sub.exif_focal_length, sub.exif_aperture, sub.exif_shutter_speed, sub.exif_iso]):
            return SubmissionExifSchema(
                camera=sub.exif_camera,
                focal_length=sub.exif_focal_length,
                aperture=sub.exif_aperture,
                shutter_speed=sub.exif_shutter_speed,
                iso=sub.exif_iso,
            )
        return None

    contests_out: list[MyResultsContestSchema] = []
    for contest in completed:
        user_subs = [s for s in contest.submissions if s.user_id == user.id]
        user_sub_ids = {s.id for s in user_subs}
        has_submission = len(user_subs) > 0

        # Skip contests the user didn't participate in
        if not has_submission:
            continue

        if contest.voting_format == VOTING_FORMAT_POINTS:
            # Placements come from the winners stored at completion (as for
            # classic contests); scores supply the points breakdown.
            scores = points_scores.get(contest.id, {})
            placed = {
                w["submissionId"]: w["place"] for w in contest.winners or []
                if w.get("category") == OVERALL_CATEGORY and w["submissionId"] in user_sub_ids
            }
            photo_results = []
            for sub in user_subs:
                score = scores[sub.id]  # every submission of a scored contest has one
                photo_results.append(PointsSubmissionResultSchema(
                    submission_id=sub.id,
                    url=sub.url,
                    title=sub.title,
                    photographer=sub.photographer,
                    place=placed.get(sub.id),
                    score=_points_score_schema(score),
                    exif=_sub_exif(sub),
                ))
            photo_results.sort(key=lambda r: (r.score.rank, r.submission_id))
            contests_out.append(MyResultsContestSchema(
                contest_id=contest.id,
                month=contest.month,
                theme=contest.theme,
                voting_format=VOTING_FORMAT_POINTS,
                wildcard_category=contest.wildcard_category,
                has_wildcard=contest.wildcard_category is not None,
                overall_result=OverallResultSchema(
                    best_place=min(placed.values(), default=None),
                    best_points=max(r.score.total for r in photo_results),
                    total_points=sum(r.score.total for r in photo_results),
                    submissions=photo_results,
                ),
            ))
            continue

        # Build winner lookup: category -> {submission_id -> place}
        winner_lookup: dict[str, dict[int, int]] = defaultdict(dict)
        if contest.winners:
            for w in contest.winners:
                if w["submissionId"] in user_sub_ids:
                    winner_lookup[w.get("category", "theme")][w["submissionId"]] = w["place"]

        def _cat_result(category: str) -> CategoryResultSchema:
            if category == "wildcard" and not contest.wildcard_category:
                return CategoryResultSchema(has_submission=False, best_place=None, submissions=[])

            placements = winner_lookup.get(category, {})
            sub_results = []
            for sub in user_subs:
                sub_results.append(SubmissionResultSchema(
                    submission_id=sub.id,
                    url=sub.url,
                    title=sub.title,
                    photographer=sub.photographer,
                    place=placements.get(sub.id),
                    exif=_sub_exif(sub),
                ))
            # Sort: placed first (by place asc), then unplaced
            sub_results.sort(key=lambda r: (r.place is None, r.place or 0))
            best = min((p for p in placements.values()), default=None)
            return CategoryResultSchema(
                has_submission=True,
                best_place=best,
                submissions=sub_results,
            )

        contests_out.append(MyResultsContestSchema(
            contest_id=contest.id,
            month=contest.month,
            theme=contest.theme,
            voting_format=VOTING_FORMAT_CLASSIC,
            wildcard_category=contest.wildcard_category,
            has_wildcard=contest.wildcard_category is not None,
            theme_result=_cat_result("theme"),
            favorite_result=_cat_result("favorite"),
            wildcard_result=_cat_result("wildcard"),
        ))

    return MyResultsResponseSchema(stats=stats, leaderboard=leaderboard, contests=contests_out)


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


_VALID_IMAGE_SIZES = {"thumb", "medium", "full", "original"}


@router.get("/{contest_id}/submissions/{submission_id}/image")
async def get_anonymous_submission_image(
    contest_id: int,
    submission_id: int,
    size: str = Query("original"),
    v: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
):
    # Streams submission image bytes through the API so the underlying storage
    # path (which embeds the photographer's name slug) is never exposed during
    # anonymous voting. Public on purpose; submission IDs aren't sensitive and
    # this is the one place voters fetch ballot images.
    if size not in _VALID_IMAGE_SIZES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid size")

    result = await db.execute(
        select(ContestSubmission).where(
            ContestSubmission.id == submission_id,
            ContestSubmission.contest_id == contest_id,
        )
    )
    sub = result.scalar_one_or_none()
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    if v is not None and v != sub.revision:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image version no longer available")

    actual_url = sub.url
    if size != "original" and "." in actual_url:
        stem, _, ext = actual_url.rpartition(".")
        actual_url = f"{stem}_{size}.{ext}"

    content = await asyncio.to_thread(read_image_bytes, actual_url)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    media_type = mimetypes.guess_type(Path(sub.url).name)[0] or "image/jpeg"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=300"},
    )


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
        submissions_locked_at=datetime.now(timezone.utc) if body.status in ("voting", "completed") else None,
        guidelines=body.guidelines,
        wildcard_category=body.wildcard_category,
        is_imported=body.status == "completed",
        # Contests created already completed are historical imports, entered
        # with per-category tallies; every new contest is voted on with points.
        voting_format=VOTING_FORMAT_CLASSIC if body.status == "completed" else VOTING_FORMAT_POINTS,
    )
    db.add(contest)
    await db.flush()  # populate contest.id before creating linked events
    await _create_contest_events(contest, db)
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
    contest = await lock_contest(db, contest_id)

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

    if contest.status in ("voting", "completed") and contest.submissions_locked_at is None:
        contest.submissions_locked_at = datetime.now(timezone.utc)

    # Auto-calculate winners when advancing from voting to completed
    if old_status == "voting" and contest.status == "completed":
        await _auto_calculate_winners(contest, db)
        await _populate_gallery_from_contest(contest, db, update_winners=True)

    # Notify submitters when contest enters voting or completed status
    if old_status != contest.status:
        if contest.status == "voting":
            await _notify_submitters_for_contest_transition(
                contest, NOTIFICATION_TYPE_CONTEST_VOTING_OPEN, db,
            )
        elif contest.status == "completed":
            await _notify_submitters_for_contest_transition(
                contest, NOTIFICATION_TYPE_CONTEST_COMPLETED, db,
            )

    # Clear winners when reverting from completed
    if old_status == "completed" and contest.status in ("voting", "active"):
        contest.winners = None
        contest.honorable_mentions = None
        contest.is_imported = False
        for sub in contest.submissions:
            sub.vote_count = 0
            sub.category_vote_tallies = None
            sub.points_score = None
        # Remove gallery entries for this contest
        gallery_result = await db.execute(
            select(GalleryPhoto).where(GalleryPhoto.contest_id == contest.id)
        )
        for gp in gallery_result.scalars().all():
            await queue_cleanup(db, gp.url)
            await _delete_notifications_for_photo(gp.id, db)
            await db.delete(gp)

    await _update_contest_events(contest, db)
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
    contest = await lock_contest(db, contest_id)
    for sub in contest.submissions:
        await queue_cleanup(db, sub.url)
    gallery_photos = (await db.execute(select(GalleryPhoto).where(GalleryPhoto.contest_id == contest_id))).scalars().all()
    for photo in gallery_photos:
        await queue_cleanup(db, photo.url)
        await _delete_notifications_for_photo(photo.id, db)
    await _delete_contest_events(contest_id, db)
    await log_activity(db, admin, "delete", "contest", str(contest_id), f"Deleted contest: {contest.theme}")
    await db.delete(contest)
    await db.commit()


# --- Submissions ---


@router.delete("/{contest_id}/submissions/{submission_id}")
async def delete_submission(
    contest_id: int,
    submission_id: int,
    body: SubmissionMutation | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if body is not None:
        return await mutate_submission(db, user, contest_id, "remove", body, submission_id)
    if user.role != "admin":
        raise HTTPException(422, "A request ID and submission revision are required.")
    contest = await lock_contest(db, contest_id)
    submission = next((s for s in contest.submissions if s.id == submission_id), None)
    if submission is None:
        raise HTTPException(404, "Submission not found")
    await queue_cleanup(db, submission.url)
    gallery_photos = (await db.execute(select(GalleryPhoto).where(
        GalleryPhoto.contest_submission_id == submission_id
    ))).scalars().all()
    for photo in gallery_photos:
        await queue_cleanup(db, photo.url)
        await _delete_notifications_for_photo(photo.id, db)
    if contest.winners:
        contest.winners = [w for w in contest.winners if w.get("submissionId") != submission_id] or None
    await log_activity(db, user, "delete", "submission", str(submission_id),
                       f"Removed contest submission: {submission.title}")
    await db.delete(submission)
    await db.commit()
    return Response(status_code=204)


# --- Voting ---

# A ballot shaped for the other voting format means the page was loaded before
# the contest switched formats (or the format check was bypassed).
STALE_BALLOT_DETAIL = "Voting has changed for this contest. Please refresh the page and vote again."
CLASSIC_BALLOT_DETAIL = "This contest uses category voting, so it can't take a points ballot."


def _points_ballot_rows(
    contest: Contest,
    ballot: PointsBallotRequest,
    user_id: uuid.UUID,
    valid_sub_ids: set[int],
    own_sub_ids: set[int],
) -> list[ContestVote]:
    """Validate a points ballot and build its vote rows.

    The voter ranks their top three eligible photos (every eligible photo when
    there are fewer), and may add one Personal Favorite and one Bonus pick;
    those may repeat ranked photos. Theme rows carry the rank; favorite and
    bonus ("wildcard") rows carry none.
    """
    eligible = valid_sub_ids - own_sub_ids
    required = min(THEME_RANKS, len(eligible))
    if required == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="There are no photos you can vote for in this contest")
    theme = ballot.theme
    if len(theme) != required:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Rank your top {required} photos for the theme")
    if len(set(theme)) != len(theme):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Each theme pick must be a different photo")
    if ballot.bonus is not None and not contest.wildcard_category:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="This contest has no bonus challenge")
    for sub_id in (*theme, ballot.favorite, ballot.bonus):
        if sub_id is None:
            continue
        if sub_id not in valid_sub_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Submission {sub_id} not found in this contest")
        if sub_id in own_sub_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail="You cannot vote for your own submissions")

    def vote(sub_id: int, category: str, rank: int | None = None) -> ContestVote:
        return ContestVote(contest_id=contest.id, submission_id=sub_id, user_id=user_id,
                           category=category, rank=rank)

    rows = [vote(sub_id, "theme", rank) for rank, sub_id in enumerate(theme, start=1)]
    if ballot.favorite is not None:
        rows.append(vote(ballot.favorite, "favorite"))
    if ballot.bonus is not None:
        rows.append(vote(ballot.bonus, "wildcard"))
    return rows


@router.post("/{contest_id}/vote", status_code=status.HTTP_201_CREATED)
async def cast_vote(
    contest_id: int,
    body: BatchVoteRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify contest exists and is in voting status
    contest = await lock_contest(db, contest_id)
    if contest.status != "voting":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contest is not in voting phase")

    is_points = contest.voting_format == VOTING_FORMAT_POINTS
    if is_points and body.ballot is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=STALE_BALLOT_DETAIL)
    if not is_points and body.votes is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=CLASSIC_BALLOT_DETAIL)

    # Check if user has already voted
    existing = await db.execute(
        select(func.count()).select_from(ContestVote).where(
            ContestVote.contest_id == contest_id,
            ContestVote.user_id == user.id,
        )
    )
    if existing.scalar_one() > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You have already voted in this contest")

    # Get all submission IDs for this contest, plus the subset owned by the
    # voting user (used to reject self-votes — defense-in-depth, since the
    # frontend already disables those affordances).
    sub_result = await db.execute(
        select(ContestSubmission.id, ContestSubmission.user_id).where(
            ContestSubmission.contest_id == contest_id
        )
    )
    valid_sub_ids: set[int] = set()
    own_sub_ids: set[int] = set()
    for sub_id, owner_id in sub_result:
        valid_sub_ids.add(sub_id)
        if owner_id == user.id:
            own_sub_ids.add(sub_id)

    if is_points:
        votes_to_add = _points_ballot_rows(contest, body.ballot, user.id, valid_sub_ids, own_sub_ids)
    else:
        votes_to_add = _classic_ballot_rows(contest, body.votes, user.id, valid_sub_ids, own_sub_ids)

    try:
        for vote in votes_to_add:
            db.add(vote)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vote conflict detected")

    return {"detail": "Votes recorded"}


def _classic_ballot_rows(
    contest: Contest,
    category_votes: list,
    user_id: uuid.UUID,
    valid_sub_ids: set[int],
    own_sub_ids: set[int],
) -> list[ContestVote]:
    """Validate a classic ballot (up to three photos per category) and build its rows."""
    valid_categories = {"theme", "favorite"}
    if contest.wildcard_category:
        valid_categories.add("wildcard")

    votes_to_add = []
    for cat_vote in category_votes:
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
            if sub_id in own_sub_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You cannot vote for your own submissions",
                )
            votes_to_add.append(
                ContestVote(
                    contest_id=contest.id,
                    submission_id=sub_id,
                    user_id=user_id,
                    category=cat_vote.category,
                )
            )
    return votes_to_add


# --- Admin Import Endpoints ---


@router.post("/{contest_id}/admin-submissions", response_model=ContestSubmissionResponse, status_code=status.HTTP_201_CREATED)
async def create_admin_submission(
    request: Request,
    contest_id: int,
    file: UploadFile,
    title: str = Form(...),
    photographer: str = Form(...),
    member_id: int | None = Form(None),
    exif_camera: str | None = Form(None),
    exif_focal_length: str | None = Form(None),
    exif_aperture: str | None = Form(None),
    exif_shutter_speed: str | None = Form(None),
    exif_iso: int | None = Form(None),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: upload a submission for an imported contest. No status or limit checks."""
    contest = await lock_contest(db, contest_id)
    if not contest.is_imported:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin submissions are only allowed for imported contests")

    await validate_image_upload(file)

    # Resolve member → user_id if a member is specified
    user_id = None
    if member_id is not None:
        member_result = await db.execute(select(Member).where(Member.id == member_id))
        member = member_result.scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        user_id = member.user_id  # may still be None if member has no linked user

    slug = make_photographer_slug(photographer)
    url = await save_submission_image(contest.month, file, user_slug=slug)

    submission = ContestSubmission(
        contest_id=contest_id,
        url=url,
        title=title,
        photographer=photographer,
        user_id=user_id,
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


@router.post("/{contest_id}/finalize", response_model=ContestResponse)
async def finalize_contest(
    contest_id: int,
    body: FinalizeContestRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: set vote tallies and calculate winners for an imported contest."""
    contest = await lock_contest(db, contest_id)
    if not contest.is_imported:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only imported contests can be finalized this way")
    if contest.voting_format != VOTING_FORMAT_CLASSIC:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only classic (category) contests can be finalized with vote tallies")
    if not contest.submissions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contest has no submissions to finalize")

    # Build submission lookup
    sub_map = {sub.id: sub for sub in contest.submissions}

    # Set tallies on each submission
    for tally in body.vote_tallies:
        sub = sub_map.get(tally.submission_id)
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Submission {tally.submission_id} not found in this contest",
            )
        sub.category_vote_tallies = {"theme": tally.theme, "favorite": tally.favorite, "wildcard": tally.wildcard}
        sub.vote_count = tally.theme + tally.favorite + tally.wildcard

    # Calculate winners from the stored tallies using dense ranking
    winners = _winners_from_tallies(contest)
    contest.winners = winners if winners else None
    contest.honorable_mentions = None

    # Populate/update gallery entries
    await _populate_gallery_from_contest(contest, db, update_winners=True)

    await log_activity(db, admin, "update", "contest", str(contest_id), f"Finalized imported contest: {contest.theme}")
    await db.commit()
    await db.refresh(contest)
    return await _contest_to_response(contest, db, admin)


@router.patch("/{contest_id}/submissions/{submission_id}/assign", response_model=ContestSubmissionResponse)
async def assign_submission(
    contest_id: int,
    submission_id: int,
    body: SubmissionAssignRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: reassign a submission to a member (or clear the assignment)."""
    contest = await lock_contest(db, contest_id)
    result = await db.execute(
        select(ContestSubmission).where(
            ContestSubmission.id == submission_id,
            ContestSubmission.contest_id == contest_id,
        )
    )
    submission = result.scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    member_id_for_gallery = None
    if body.member_id is not None:
        member_result = await db.execute(select(Member).where(Member.id == body.member_id))
        member = member_result.scalar_one_or_none()
        if member is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
        if member.user_id and lock_reason(contest) is None:
            assigned_count = await db.scalar(select(func.count()).select_from(ContestSubmission).where(
                ContestSubmission.contest_id == contest_id,
                ContestSubmission.user_id == member.user_id,
                ContestSubmission.id != submission_id,
            ))
            if assigned_count >= MAX_SUBMISSIONS_PER_USER:
                raise HTTPException(409, "This member already has three entries in this contest.")
        submission.user_id = member.user_id
        member_id_for_gallery = member.id
    else:
        submission.user_id = None

    submission.revision += 1
    submission.updated_at = datetime.now(timezone.utc)
    submission.photographer = body.photographer

    # Update the corresponding gallery entry if it exists
    gallery_result = await db.execute(
        select(GalleryPhoto).where(GalleryPhoto.contest_submission_id == submission_id)
    )
    gallery_photo = gallery_result.scalar_one_or_none()
    if gallery_photo:
        gallery_photo.photographer = body.photographer
        gallery_photo.member_id = member_id_for_gallery

    await db.commit()
    await db.refresh(submission)

    # Build category_votes from tallies if available
    category_votes = None
    if submission.category_vote_tallies:
        category_votes = CategoryVotesSchema(
            theme=submission.category_vote_tallies.get("theme", 0),
            favorite=submission.category_vote_tallies.get("favorite", 0),
            wildcard=submission.category_vote_tallies.get("wildcard", 0),
        )

    return _submission_to_response(submission, category_votes)


@router.post("/{contest_id}/backfill-exif")
async def backfill_exif(
    contest_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: extract EXIF from stored images and backfill submissions + gallery entries."""
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")

    updated = 0
    skipped = 0
    for sub in contest.submissions:
        # Skip if EXIF is already populated
        if any([sub.exif_camera, sub.exif_focal_length, sub.exif_aperture, sub.exif_shutter_speed, sub.exif_iso]):
            skipped += 1
            continue

        content = read_image_bytes(sub.url)
        if content is None:
            skipped += 1
            continue

        exif = extract_exif_from_bytes(content)
        if not exif:
            skipped += 1
            continue

        # Update submission
        if exif.get("camera"):
            sub.exif_camera = exif["camera"]
        if exif.get("focal_length"):
            sub.exif_focal_length = exif["focal_length"]
        if exif.get("aperture"):
            sub.exif_aperture = exif["aperture"]
        if exif.get("shutter_speed"):
            sub.exif_shutter_speed = exif["shutter_speed"]
        if exif.get("iso"):
            sub.exif_iso = exif["iso"]

        # Also update corresponding gallery entry
        gallery_result = await db.execute(
            select(GalleryPhoto).where(GalleryPhoto.contest_submission_id == sub.id)
        )
        gp = gallery_result.scalar_one_or_none()
        if gp:
            gp.exif_camera = sub.exif_camera
            gp.exif_focal_length = sub.exif_focal_length
            gp.exif_aperture = sub.exif_aperture
            gp.exif_shutter_speed = sub.exif_shutter_speed
            gp.exif_iso = sub.exif_iso

        updated += 1

    await db.commit()
    return {"detail": f"EXIF backfill complete: {updated} updated, {skipped} skipped"}


@router.post("/{contest_id}/refresh-gallery")
async def refresh_gallery(
    contest_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: re-sync gallery entries from current contest winners (updates placements)."""
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")
    if contest.status != "completed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contest must be completed")

    await _populate_gallery_from_contest(contest, db, update_winners=True)
    await db.commit()
    return {"detail": "Gallery entries refreshed with current winner placements"}


@router.get("/{contest_id}/live-tallies", response_model=LiveTalliesResponse)
async def get_live_tallies(
    contest_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only, for debugging: tallies from the ballots cast so far.

    Members never see results before a contest completes, and this returns
    aggregates only, never who voted for what. Always computed live from the
    ballots, even for a completed points contest (whose published results are
    frozen at completion).
    """
    result = await db.execute(select(Contest).where(Contest.id == contest_id))
    contest = result.scalar_one_or_none()
    if contest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contest not found")

    ballots = await db.scalar(
        select(func.count(func.distinct(ContestVote.user_id))).where(ContestVote.contest_id == contest_id)
    )
    if contest.voting_format == VOTING_FORMAT_POINTS:
        tallies = [
            LiveTallySchema(submission_id=score.submission_id, score=_points_score_schema(score))
            for score in await load_points_scores(db, contest)
        ]
    else:
        counts = await _classic_vote_counts(db, contest_id)
        tallies = [
            LiveTallySchema(submission_id=sub.id, category_votes=counts.get(sub.id, CategoryVotesSchema()))
            for sub in contest.submissions
        ]
        tallies.sort(key=lambda t: (
            -(t.category_votes.theme + t.category_votes.favorite + t.category_votes.wildcard),
            t.submission_id,
        ))

    return LiveTalliesResponse(
        contest_id=contest.id,
        voting_format=contest.voting_format,
        status=contest.status,
        ballots=ballots or 0,
        submissions=tallies,
    )


@router.post("/recalculate-winners")
async def recalculate_winners(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: recompute winners for every completed contest under the
    rules it ran under, then refresh gallery winner badges.

    Classic contests keep their three dense-ranked category podiums: organic
    ones recompute from their recorded votes, imported ones from the vote
    tallies stored at finalize time (imported contests never finalized are
    left untouched). Points contests recompute their single leaderboard.
    """
    result = await db.execute(select(Contest).where(Contest.status == "completed"))
    contests = result.scalars().unique().all()

    recalculated = 0
    skipped = 0
    for contest in contests:
        if contest.is_imported:
            if not any(sub.category_vote_tallies for sub in contest.submissions):
                skipped += 1
                continue
            winners = _winners_from_tallies(contest)
            contest.winners = winners if winners else None
        elif contest.voting_format == VOTING_FORMAT_POINTS:
            await _calculate_points_winners(contest, db, rescore_stored=True)
        else:
            await _calculate_classic_winners(contest, db)
        contest.honorable_mentions = None
        await _populate_gallery_from_contest(contest, db, update_winners=True)
        recalculated += 1

    await log_activity(
        db, admin, "update", "contest", "all",
        f"Recalculated winners for {recalculated} completed contests",
    )
    await db.commit()
    return {"detail": f"Recalculated winners for {recalculated} contests ({skipped} skipped)"}
