"""Tests for points-format contest scoring (app.services.points_scoring).

Rules: theme ranks score 3 / 2 / 1, a Personal Favorite pick and a Bonus
Challenge pick score 1 each. One leaderboard by total points. Ties are broken
by theme points, then #1 theme votes, then #2 theme votes; photos still tied
share the place, numbered 1, 1, 3. Zero-point photos never place.

Pure functions — no database needed:
    python -m pytest backend/tests/test_points_scoring.py -q
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.points_scoring import (  # noqa: E402
    OVERALL_CATEGORY,
    TIEBREAK_FIRST_CHOICE,
    TIEBREAK_SECOND_CHOICE,
    TIEBREAK_THEME_POINTS,
    points_winners,
    score_submissions,
)


def theme(sub_id, rank, count=1):
    return (sub_id, "theme", rank, count)


def fav(sub_id, count=1):
    return (sub_id, "favorite", None, count)


def bonus(sub_id, count=1):
    return (sub_id, "wildcard", None, count)


def by_id(scores):
    return {s.submission_id: s for s in scores}


def test_points_add_up_across_theme_favorite_and_bonus():
    scores = by_id(score_submissions(
        [1, 2],
        [theme(1, 1, 2), theme(1, 2), theme(1, 3, 3), fav(1, 2), bonus(1), theme(2, 1)],
    ))
    s = scores[1]
    assert (s.theme_first, s.theme_second, s.theme_third) == (2, 1, 3)
    assert s.theme_points == 2 * 3 + 1 * 2 + 3 * 1
    assert (s.favorite, s.bonus) == (2, 1)
    assert s.total == 14
    assert scores[2].total == 3


def test_leaderboard_orders_by_total_points():
    scores = score_submissions([1, 2, 3], [theme(2, 1, 3), theme(1, 1), theme(3, 2)])
    assert [(s.submission_id, s.rank) for s in scores] == [(2, 1), (1, 2), (3, 3)]
    assert all(s.tiebreak is None for s in scores)


def test_equal_totals_broken_by_theme_points():
    # Both 6 pts: #1 is all theme (two 1st votes); #2 is 4 theme + favorite + bonus.
    scores = score_submissions([1, 2], [theme(1, 1, 2), theme(2, 1), theme(2, 3), fav(2), bonus(2)])
    assert [(s.submission_id, s.total, s.rank) for s in scores] == [(1, 6, 1), (2, 6, 2)]
    assert all(s.tiebreak == TIEBREAK_THEME_POINTS for s in scores)


def test_equal_theme_points_broken_by_first_choice_votes():
    # Both 6 theme pts: #1 = 1st + 2nd + 3rd; #2 = three 2nds.
    scores = score_submissions([1, 2], [theme(1, 1), theme(1, 2), theme(1, 3), theme(2, 2, 3)])
    assert [(s.submission_id, s.rank) for s in scores] == [(1, 1), (2, 2)]
    assert all(s.tiebreak == TIEBREAK_FIRST_CHOICE for s in scores)


def test_equal_first_choice_votes_broken_by_second_choice_votes():
    # Both 7 theme pts with one 1st vote: #1 has two 2nds; #2 has one 2nd and two 3rds.
    scores = score_submissions(
        [1, 2],
        [theme(1, 1), theme(1, 2, 2), theme(2, 1), theme(2, 2), theme(2, 3, 2)],
    )
    assert [(s.submission_id, s.total, s.rank) for s in scores] == [(1, 7, 1), (2, 7, 2)]
    assert all(s.tiebreak == TIEBREAK_SECOND_CHOICE for s in scores)


def test_full_tie_shares_place_and_skips_the_next_number():
    # Identical breakdowns share 1st; the next photo is 3rd (1, 1, 3).
    scores = score_submissions([1, 2, 3], [theme(1, 1), fav(1), theme(2, 1), fav(2), theme(3, 2)])
    assert [(s.submission_id, s.rank, s.place) for s in scores] == [(1, 1, 1), (2, 1, 1), (3, 3, 3)]
    assert all(s.tiebreak is None for s in scores)


def test_tied_pair_then_lower_photo_all_note_the_deciding_tiebreak():
    # #1 and #2 are identical; #3 matches their total with fewer theme points.
    scores = score_submissions([1, 2, 3], [theme(1, 1), theme(2, 1), theme(3, 2), fav(3)])
    assert [(s.submission_id, s.rank) for s in scores] == [(1, 1), (2, 1), (3, 3)]
    assert [s.tiebreak for s in scores] == [TIEBREAK_THEME_POINTS] * 3


def test_zero_point_photos_never_place():
    scores = by_id(score_submissions([1, 2, 3], [theme(1, 1)]))
    assert scores[1].place == 1
    assert scores[2].place is None and scores[3].place is None
    assert scores[2].rank == scores[3].rank == 2


def test_only_the_top_three_places_count():
    scores = score_submissions([1, 2, 3, 4], [theme(1, 1, 4), theme(2, 1, 3), theme(3, 1, 2), theme(4, 1)])
    assert [s.place for s in scores] == [1, 2, 3, None]


def test_bonus_votes_ignored_without_a_bonus_challenge():
    scores = by_id(score_submissions([1], [theme(1, 1), bonus(1, 2)], count_bonus=False))
    assert scores[1].bonus == 0 and scores[1].total == 3


def test_votes_for_unknown_submissions_are_ignored():
    scores = score_submissions([1], [theme(1, 2), theme(99, 1, 5), fav(99)])
    assert [(s.submission_id, s.total) for s in scores] == [(1, 2)]


def test_theme_rows_without_a_rank_earn_nothing():
    # Classic-style theme approvals carry no rank.
    scores = by_id(score_submissions([1], [theme(1, None, 4), fav(1)]))
    assert scores[1].theme_points == 0 and scores[1].total == 1


def test_points_winners_list_the_podium_as_overall():
    scores = score_submissions([1, 2, 3, 4], [theme(1, 1, 2), theme(2, 1, 2), theme(3, 2), theme(4, 3)])
    assert points_winners(scores) == [
        {"submissionId": 1, "place": 1, "category": OVERALL_CATEGORY},
        {"submissionId": 2, "place": 1, "category": OVERALL_CATEGORY},
        {"submissionId": 3, "place": 3, "category": OVERALL_CATEGORY},
    ]


def test_empty_contest_scores_nothing():
    assert score_submissions([], []) == []
    assert points_winners([]) == []


def test_snapshot_round_trip_keeps_counts_rank_and_tiebreak():
    from app.services.points_scoring import from_snapshot, snapshot
    scores = score_submissions([1, 2], [theme(1, 1, 2), theme(2, 1), theme(2, 3), fav(2), bonus(2)])
    restored = [from_snapshot(s.submission_id, snapshot(s)) for s in scores]
    assert restored == scores
    assert snapshot(scores[0]) == {
        "theme_first": 2, "theme_second": 0, "theme_third": 0, "favorite": 0, "bonus": 0,
        "rank": 1, "tiebreak": TIEBREAK_THEME_POINTS,
    }


def test_rescore_reranks_stored_results_without_ballots():
    from app.services.points_scoring import PointsScore, rescore
    stored = [
        PointsScore(submission_id=1, theme_first=1, rank=9, tiebreak="stale"),
        PointsScore(submission_id=2, theme_first=1, favorite=1, rank=9),
        PointsScore(submission_id=3, bonus=2, rank=9),
    ]
    assert [(s.submission_id, s.total, s.rank, s.tiebreak) for s in rescore(stored)] == [
        (2, 4, 1, None), (1, 3, 2, None), (3, 2, 3, None),
    ]
    assert [s.total for s in rescore(stored, count_bonus=False)] == [4, 3, 0]
