"""Scoring for points-format contests: pure functions, no database access.

Each ballot ranks up to three photos for the theme (1st = 3 points, 2nd = 2,
3rd = 1) and may add one Personal Favorite point and one Bonus Challenge point.
All points feed a single leaderboard.

Ordering is total points, then theme points, then #1 theme votes, then #2 theme
votes. Photos still tied after every tiebreaker share the place, numbered
1, 1, 3 (standard competition ranking). Only photos with points can place, and
only the top three places count. Submission time never breaks a tie.

Classic (three-category) contests are scored elsewhere and never come through
here — see ``_calculate_classic_winners`` in app/api/contests.py.
"""

from collections.abc import Iterable
from dataclasses import dataclass

THEME_RANK_POINTS = {1: 3, 2: 2, 3: 1}
FAVORITE_POINTS = 1
BONUS_POINTS = 1
PODIUM_PLACES = 3

# Winners of a points contest are stored with this category (classic contests
# use theme / favorite / wildcard).
OVERALL_CATEGORY = "overall"

# Tiebreaker labels, in the order they are applied after total points.
TIEBREAK_THEME_POINTS = "theme_points"
TIEBREAK_FIRST_CHOICE = "first_choice"
TIEBREAK_SECOND_CHOICE = "second_choice"


@dataclass
class PointsScore:
    submission_id: int
    theme_first: int = 0
    theme_second: int = 0
    theme_third: int = 0
    favorite: int = 0
    bonus: int = 0
    # Competition rank on the leaderboard (1-based); equal scores share it.
    rank: int = 0
    # Which tiebreaker ordered this photo's group (photos identical on every
    # measure) against a neighbouring group with the same total: the group
    # above when it shares the total, otherwise the group below. None when no
    # other photo has the same total. When three or more groups share a total,
    # a middle group names only the tiebreaker against the group above it.
    tiebreak: str | None = None

    @property
    def theme_points(self) -> int:
        return (
            self.theme_first * THEME_RANK_POINTS[1]
            + self.theme_second * THEME_RANK_POINTS[2]
            + self.theme_third * THEME_RANK_POINTS[3]
        )

    @property
    def total(self) -> int:
        return self.theme_points + self.favorite * FAVORITE_POINTS + self.bonus * BONUS_POINTS

    @property
    def place(self) -> int | None:
        """Podium place (1-3), or None when the photo didn't place."""
        return self.rank if self.total > 0 and self.rank <= PODIUM_PLACES else None

    def sort_key(self) -> tuple[int, int, int, int]:
        return (self.total, self.theme_points, self.theme_first, self.theme_second)


_TIEBREAKERS = (
    (TIEBREAK_THEME_POINTS, lambda s: s.theme_points),
    (TIEBREAK_FIRST_CHOICE, lambda s: s.theme_first),
    (TIEBREAK_SECOND_CHOICE, lambda s: s.theme_second),
)


def _deciding_tiebreak(a: PointsScore, b: PointsScore) -> str | None:
    for label, value in _TIEBREAKERS:
        if value(a) != value(b):
            return label
    return None


def score_submissions(
    submission_ids: Iterable[int],
    vote_counts: Iterable[tuple[int, str, int | None, int]],
    *,
    count_bonus: bool = True,
) -> list[PointsScore]:
    """Score every submission from aggregated ballot rows.

    *vote_counts* rows are ``(submission_id, category, rank, count)``: theme
    rows carry the rank (1-3) the voters gave; favorite and wildcard (bonus)
    rows carry no rank. Rows for unknown submissions are ignored, as are
    bonus rows when the contest has no bonus challenge (*count_bonus* False).

    Returns every submission best-first, with ``rank`` and ``tiebreak`` set.
    Fully tied photos are listed in submission-id order.
    """
    scores = {sub_id: PointsScore(submission_id=sub_id) for sub_id in submission_ids}
    for sub_id, category, rank, count in vote_counts:
        score = scores.get(sub_id)
        if score is None:
            continue
        if category == "theme":
            if rank == 1:
                score.theme_first += count
            elif rank == 2:
                score.theme_second += count
            elif rank == 3:
                score.theme_third += count
        elif category == "favorite":
            score.favorite += count
        elif category == "wildcard" and count_bonus:
            score.bonus += count

    ordered = sorted(
        scores.values(),
        key=lambda s: (tuple(-v for v in s.sort_key()), s.submission_id),
    )

    # Runs of identical scores share a rank; the next run's rank is its position.
    runs: list[list[PointsScore]] = []
    for position, score in enumerate(ordered, start=1):
        if runs and runs[-1][0].sort_key() == score.sort_key():
            score.rank = runs[-1][0].rank
            runs[-1].append(score)
        else:
            score.rank = position
            runs.append([score])

    # Record which tiebreaker separated runs that share a point total: compare
    # with the run above when it has the same total, else with the run below.
    for i, run in enumerate(runs):
        head = run[0]
        above = runs[i - 1][0] if i > 0 else None
        below = runs[i + 1][0] if i + 1 < len(runs) else None
        if above is not None and above.total == head.total:
            tiebreak = _deciding_tiebreak(above, head)
        elif below is not None and below.total == head.total:
            tiebreak = _deciding_tiebreak(head, below)
        else:
            tiebreak = None
        for score in run:
            score.tiebreak = tiebreak

    return ordered


def points_winners(scores: Iterable[PointsScore]) -> list[dict]:
    """The podium in the stored ``contest.winners`` shape, best-first."""
    return [
        {"submissionId": s.submission_id, "place": s.place, "category": OVERALL_CATEGORY}
        for s in scores
        if s.place is not None
    ]


# A completed contest's results are frozen per photo in
# ``contest_submissions.points_score`` so later changes to ballots (a deleted
# member's votes cascade away) never rewrite a finished leaderboard.
_SNAPSHOT_FIELDS = ("theme_first", "theme_second", "theme_third", "favorite", "bonus", "rank", "tiebreak")


def snapshot(score: PointsScore) -> dict:
    """The JSON stored for one photo when its contest completes."""
    return {field: getattr(score, field) for field in _SNAPSHOT_FIELDS}


def from_snapshot(submission_id: int, data: dict) -> PointsScore:
    return PointsScore(
        submission_id=submission_id,
        theme_first=data.get("theme_first", 0),
        theme_second=data.get("theme_second", 0),
        theme_third=data.get("theme_third", 0),
        favorite=data.get("favorite", 0),
        bonus=data.get("bonus", 0),
        rank=data.get("rank", 0),
        tiebreak=data.get("tiebreak"),
    )


def rescore(scores: Iterable[PointsScore], *, count_bonus: bool = True) -> list[PointsScore]:
    """Re-rank stored results under the current rules, without the ballots.

    Used by Recalculate Winners: the vote counts are kept as frozen at
    completion, while rank and tiebreak are derived afresh.
    """
    scores = list(scores)
    rows = []
    for s in scores:
        rows += [
            (s.submission_id, "theme", 1, s.theme_first),
            (s.submission_id, "theme", 2, s.theme_second),
            (s.submission_id, "theme", 3, s.theme_third),
            (s.submission_id, "favorite", None, s.favorite),
            (s.submission_id, "wildcard", None, s.bonus),
        ]
    return score_submissions([s.submission_id for s in scores], rows, count_bonus=count_bonus)
