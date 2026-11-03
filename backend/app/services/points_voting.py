"""Database helpers for points-format contests.

Scoring itself is pure (points_scoring.py). This module loads ballots for it,
and performs the one-off switch of a classic contest that is still being voted
on to points voting.
"""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.contest import Contest, ContestVote, ContestVoteArchive, VOTING_FORMAT_POINTS
from ..models.notification import NOTIFICATION_TYPE_CONTEST_REVOTE, Notification
from .points_scoring import PointsScore, from_snapshot, score_submissions
from .submission_management import lock_contest

SWITCH_REASON = "switched_to_points"


def _score(contest: Contest, vote_counts) -> list[PointsScore]:
    return score_submissions(
        [sub.id for sub in contest.submissions],
        vote_counts,
        count_bonus=bool(contest.wildcard_category),
    )


async def load_points_scores(db: AsyncSession, contest: Contest) -> list[PointsScore]:
    """Score every submission of *contest* from its ballots, best-first."""
    rows = await db.execute(
        select(ContestVote.submission_id, ContestVote.category, ContestVote.rank, func.count())
        .where(ContestVote.contest_id == contest.id)
        .group_by(ContestVote.submission_id, ContestVote.category, ContestVote.rank)
    )
    return _score(contest, rows.all())


async def load_points_scores_by_contest(
    db: AsyncSession, contests: Sequence[Contest],
) -> dict[int, dict[int, PointsScore]]:
    """``load_points_scores`` for many contests in one query.

    Returns contest id -> {submission id -> score}.
    """
    if not contests:
        return {}
    rows = await db.execute(
        select(
            ContestVote.contest_id, ContestVote.submission_id,
            ContestVote.category, ContestVote.rank, func.count(),
        )
        .where(ContestVote.contest_id.in_([c.id for c in contests]))
        .group_by(
            ContestVote.contest_id, ContestVote.submission_id,
            ContestVote.category, ContestVote.rank,
        )
    )
    by_contest: dict[int, list[tuple]] = defaultdict(list)
    for contest_id, sub_id, category, rank, count in rows:
        by_contest[contest_id].append((sub_id, category, rank, count))
    return {
        c.id: {s.submission_id: s for s in _score(c, by_contest[c.id])}
        for c in contests
    }


def stored_points_scores(contest: Contest) -> list[PointsScore] | None:
    """Scores frozen when *contest* completed, best-first.

    None unless every submission has a frozen score (the contest hasn't
    completed, or it completed before scores were stored).
    """
    subs = contest.submissions
    if not subs or any(sub.points_score is None for sub in subs):
        return None
    scores = [from_snapshot(sub.id, sub.points_score) for sub in subs]
    scores.sort(key=lambda s: (s.rank, s.submission_id))
    return scores


async def points_results(db: AsyncSession, contest: Contest) -> list[PointsScore]:
    """A completed points contest's results: frozen scores when stored,
    otherwise scored from the ballots."""
    stored = stored_points_scores(contest)
    return stored if stored is not None else await load_points_scores(db, contest)


async def points_results_by_contest(
    db: AsyncSession, contests: Sequence[Contest],
) -> dict[int, dict[int, PointsScore]]:
    """``points_results`` for many contests: contest id -> {submission id -> score}.
    Contests without frozen scores are scored from their ballots in one query."""
    results: dict[int, dict[int, PointsScore]] = {}
    unfrozen = []
    for contest in contests:
        stored = stored_points_scores(contest)
        if stored is None:
            unfrozen.append(contest)
        else:
            results[contest.id] = {s.submission_id: s for s in stored}
    results.update(await load_points_scores_by_contest(db, unfrozen))
    return results


@dataclass
class SwitchResult:
    contest_id: int
    theme: str
    status: str
    archived_votes: int
    voters: int
    already_points: bool = False


async def switch_contest_to_points(
    db: AsyncSession, contest_id: int, *, apply: bool = True,
) -> SwitchResult:
    """Move a classic contest that hasn't completed to points voting.

    Classic ballots can't be converted (they hold up to three unranked picks
    per category), so they are copied to ``contest_vote_archive`` and cleared,
    and, while voting is open, everyone who had voted is notified to vote
    again. With ``apply=False`` nothing changes and the result previews the
    effect. Completed contests keep their original rules (ValueError).
    """
    contest = await lock_contest(db, contest_id)
    # Read these before any rollback: rolling back expires loaded attributes.
    theme, status = contest.theme, contest.status
    if status == "completed":
        await db.rollback()
        raise ValueError(
            f'Contest {contest_id} ("{theme}") is completed and keeps its original voting rules.'
        )
    if contest.voting_format == VOTING_FORMAT_POINTS:
        await db.rollback()
        return SwitchResult(contest_id, theme, status, 0, 0, already_points=True)

    votes = (await db.execute(
        select(ContestVote).where(ContestVote.contest_id == contest_id)
    )).scalars().all()
    voter_ids = sorted({v.user_id for v in votes}, key=str)
    result = SwitchResult(contest_id, theme, status, len(votes), len(voter_ids))
    if not apply:
        await db.rollback()
        return result

    for vote in votes:
        db.add(ContestVoteArchive(
            contest_id=contest.id,
            submission_id=vote.submission_id,
            user_id=vote.user_id,
            category=vote.category,
            rank=vote.rank,
            voted_at=vote.created_at,
            reason=SWITCH_REASON,
        ))
    await db.execute(delete(ContestVote).where(ContestVote.contest_id == contest.id))
    contest.voting_format = VOTING_FORMAT_POINTS
    if contest.status == "voting":
        payload = {"contestId": contest.id, "contestTheme": contest.theme, "contestMonth": contest.month}
        for user_id in voter_ids:
            db.add(Notification(user_id=user_id, type=NOTIFICATION_TYPE_CONTEST_REVOTE, payload=payload))
    await db.commit()
    return result
