# Points Voting & My Results Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the theme-weighted points ballot and single leaderboard for new contests (and the contest in voting at cutover), keep classic contests untouched, and refresh My Results to archive classic results while building on them.

**Architecture:** A per-contest `voting_format` (`classic` | `points`) selects the ballot, scoring, and results views everywhere. Points scoring is a pure module (`points_scoring.py`); DB helpers and the one-off cutover live in `points_voting.py`. The classic code paths are left as they are behind the format switch.

**Tech Stack:** FastAPI + SQLAlchemy async + Alembic + PostgreSQL 16; React 19 + TypeScript + Vite.

**Spec:** `docs/superpowers/specs/2026-11-03-points-voting-design.md`

> Execution note: the user asked to start implementing right away, so this plan pins down
> files, interfaces, behaviors and test cases, and the code is written straight into the
> named files (inline execution, same session). Interfaces below are binding: later tasks
> rely on these names.

---

## File map

| File | Responsibility |
|---|---|
| `backend/app/models/contest.py` | `voting_format`, `ContestVote.rank` + partial unique index, `ContestVoteArchive`, format constants |
| `backend/alembic/versions/024_points_voting.py` | Schema + backfill (classic for completed/voting/has-ballots) |
| `backend/app/services/points_scoring.py` | **Pure** scoring: `PointsScore`, `score_submissions`, `points_winners` |
| `backend/app/services/points_voting.py` | DB helpers: `load_points_scores`, `load_points_scores_by_contest`, `switch_contest_to_points` |
| `backend/app/schemas/contest.py` | `PointsScoreSchema`, `PointsBallotRequest`, My Results points schemas, stats/leaderboard fields |
| `backend/app/api/contests.py` | Format dispatch: response, vote, completion/recalc, create, finalize guard, my-results |
| `backend/app/models/notification.py` | `NOTIFICATION_TYPE_CONTEST_REVOTE` |
| `backend/scripts/switch_contest_to_points.py` | One-off CLI wrapper (dry run by default) |
| `backend/tests/test_points_scoring.py` | Pure scoring tests |
| `backend/tests/test_points_voting.py` | DB-backed ballot/completion/recalc/my-results/switch tests |
| `src/types/contest.ts` | `VotingFormat`, `PlacementCategory`, `PointsScore`, `PointsTiebreak`, My Results types, labels |
| `src/api/contests.ts` | `castBallot` |
| `src/utils/contestPlacements.ts` | `placementScore`, `rankByPoints` |
| `src/utils/winnersShowcase.ts` | include `overall` |
| `src/utils/shuffle.ts` | `shuffleArray` (moved out of ContestPage) |
| `src/pages/contest/VoteLightbox.tsx` | Moved from ContestPage; optional label props |
| `src/pages/contest/WizardProgressBar.tsx` | Moved from ContestPage |
| `src/pages/contest/PointsBallot.tsx` | New ballot (rank tray, favorite, bonus, review) |
| `src/pages/contest/PointsResults.tsx` | `PointsWinners`, `PointsFullResults` |
| `src/pages/ContestPage.tsx` / `.css` | Dispatch by format; rules copy; styles for tray/badges |
| `src/pages/MyResultsPage.tsx` / `.css` | Overview (all-time), points strip, classic archive, points lightbox |
| `src/components/ContestSection.tsx` | Home copy |
| `src/components/GalleryLightbox.tsx` | `PlacementCategory` label |
| `src/components/NotificationItem.tsx`, `src/types/notifications.ts`, `src/pages/NotificationsPage.tsx` | `contest_revote` |
| `src/pages/admin/ContestsSection.tsx` | Format badge, recalc copy |

## Binding interfaces

```python
# models/contest.py
VOTING_FORMAT_CLASSIC = "classic"; VOTING_FORMAT_POINTS = "points"; THEME_RANKS = 3
Contest.voting_format: str  # default/server_default "points"
ContestVote.rank: int | None  # theme rows of points ballots: 1..3
class ContestVoteArchive: id, contest_id, submission_id, user_id, category, rank, voted_at, archived_at, reason

# services/points_scoring.py
THEME_RANK_POINTS = {1: 3, 2: 2, 3: 1}; FAVORITE_POINTS = BONUS_POINTS = 1; OVERALL_CATEGORY = "overall"
TIEBREAK_THEME_POINTS = "theme_points"; TIEBREAK_FIRST_CHOICE = "first_choice"; TIEBREAK_SECOND_CHOICE = "second_choice"
@dataclass class PointsScore: submission_id, theme_first, theme_second, theme_third, favorite, bonus, rank, tiebreak
    .theme_points, .total, .place (rank if total > 0 and rank <= 3 else None)
def score_submissions(submission_ids, vote_counts: Iterable[(sub_id, category, rank, count)], *, count_bonus=True) -> list[PointsScore]  # best-first
def points_winners(scores) -> list[{"submissionId", "place", "category": "overall"}]

# services/points_voting.py
async def load_points_scores(db, contest) -> list[PointsScore]
async def load_points_scores_by_contest(db, contests) -> dict[contest_id, dict[submission_id, PointsScore]]
async def switch_contest_to_points(db, contest_id, *, apply=True) -> SwitchResult(contest_id, theme, status, archived_votes, voters, already_points)
```

```ts
type VotingFormat = 'classic' | 'points'; type PlacementCategory = VoteCategory | 'overall';
type PointsTiebreak = 'theme_points' | 'first_choice' | 'second_choice';
interface PointsScore { total; themePoints; themeFirst; themeSecond; themeThird; favorite; bonus; rank; tiebreak? }
Contest.votingFormat; ContestSubmission.score?; ContestWinner.category: PlacementCategory
castBallot(contestId, { theme: number[]; favorite: number | null; bonus: number | null })
```

Vote API: `POST /contests/{id}/vote` body `{votes:[...]}` (classic) or `{ballot:{theme,favorite,bonus}}` (points).
A points contest that receives `votes` responds 409 with "Voting has changed for this contest. Please refresh the page and vote again."

---

### Task 1: Pure points scoring (TDD)

**Files:** Create `backend/app/services/points_scoring.py`, `backend/tests/test_points_scoring.py`

- [ ] Write the tests:
  - totals add up across theme, favorite and bonus
  - equal totals are ordered by theme points, then #1 theme votes, then #2 theme votes, and each tied group is annotated with the deciding criterion
  - a full tie shares the rank with numbering 1, 1, 3
  - zero-point photos never place
  - bonus votes are ignored when `count_bonus=False`
  - unknown submission ids are ignored
  - theme rows with `rank=None` are ignored
  - `points_winners` shape
  - an identical pair followed by a lower photo all carry `theme_points`
- [ ] Run `backend/venv/Scripts/python.exe -m pytest backend/tests/test_points_scoring.py -q` and confirm it fails (module missing).
- [ ] Implement `points_scoring.py` per the binding interface (competition ranking; tiebreak annotation by runs of equal keys: compare with the run above when it has the same total, otherwise with the run below).
- [ ] Re-run and confirm it passes.

### Task 2: Schema, model, migration

**Files:** Modify `backend/app/models/contest.py`, `backend/app/models/__init__.py`, `backend/app/models/notification.py`; create `backend/alembic/versions/024_points_voting.py`

- [ ] Add the constants, `Contest.voting_format` (default + server_default `points`), `ContestVote.rank`,
  the partial unique index `uq_contest_votes_contest_user_category_rank` (rank IS NOT NULL), `ContestVoteArchive`, and `NOTIFICATION_TYPE_CONTEST_REVOTE`.
- [ ] Migration 024: add the columns, backfill classic for `status IN ('completed','voting')` or contests with ballots, add the rank column and index, create the archive table and its index. The downgrade reverses all of it.

### Task 3: DB helpers + API dispatch (TDD, DB-backed)

**Files:** Create `backend/app/services/points_voting.py`, `backend/tests/test_points_voting.py`; modify `backend/app/schemas/contest.py`, `backend/app/api/contests.py`

- [ ] Write the DB tests (isolated schema fixture, the same pattern as `test_submission_management.py`):
  1. A points ballot stores ranks 1–3 plus favorite/wildcard rows with no rank. Each of these is rejected:
     - wrong theme count → 400
     - duplicate pick → 400
     - own photo → 400
     - bonus with no bonus challenge → 400
     - classic `votes` body → 409 with the refresh message
     - second ballot → 409
  2. Moving voting → completed scores points; the winners are `overall` (shared 1st numbered 1, 1, 3); `vote_count` equals the totals; the contest response carries a `score` per submission; gallery `winner_category == "overall"`.
  3. Recalculate leaves a classic contest's category winners identical.
  4. My Results across one classic and one points contest:
     - medal counts are all-time
     - overall counts, `totalVotes` (classic only), `totalPoints` and `firstChoiceVotes` are correct
     - `votingFormat` is set per contest and `overallResult` is populated
  5. `switch_contest_to_points`:
     - archives and deletes the ballots, flips the format, and notifies each voter once
     - `userHasVoted` becomes false
     - a second run reports `already_points`
     - a dry run changes nothing
     - completed contests are refused
- [ ] Start local Postgres (pgserver recipe in memory), run the tests and confirm they fail.
- [ ] Implement:
  - the schemas (`PointsScoreSchema`, `PointsBallotRequest`, `BatchVoteRequest.votes` optional plus `ballot`, `PointsSubmissionResultSchema`, `OverallResultSchema`, My Results contest/stats/leaderboard fields)
  - `points_voting.py`
  - in `contests.py`:
    - `_submission_to_response(score=...)` and `_contest_to_response` (`voting_format`, scores when completed)
    - `_auto_calculate_winners` dispatch, with the classic body moved into `_calculate_classic_winners`
    - `cast_vote` format branch and `_points_ballot_rows`
    - `create_contest` format choice; a classic-only guard on `finalize_contest`
    - `get_my_results` rewrite
- [ ] Run the full backend suite and confirm it passes; also run `py_compile` on the files CI compiles.

### Task 4: Cutover script

**Files:** Create `backend/scripts/switch_contest_to_points.py`

- [ ] CLI:
  - no args → list the contests in voting with their format
  - `--contest-id N` → dry-run summary
  - `--contest-id N --apply` → switch
- [ ] Remind the operator to run `scripts/backup_db.sh` first. The script wraps `switch_contest_to_points` (already covered by the Task 3 tests).

### Task 5: Frontend types, API, utils

**Files:** `src/types/contest.ts`, `src/api/contests.ts`, `src/utils/contestPlacements.ts`, `src/utils/winnersShowcase.ts`, `src/utils/shuffle.ts`, `src/components/GalleryLightbox.tsx`, notification files

- [ ] Add the binding TS types; `getCategoryLabel` handles `overall`; add `tiebreakLabel`.
- [ ] `castBallot`.
- [ ] `placementScore(sub, category)` (overall → `score.total`); `groupWinnersByPlace` uses it; `rankByPoints(subs)`.
- [ ] Showcase includes `overall`; the gallery lightbox casts to `PlacementCategory`.
- [ ] `contest_revote` type, renderer and filter.

### Task 6: Points ballot + contest page

**Files:** Create `src/pages/contest/{VoteLightbox,WizardProgressBar,PointsBallot,PointsResults}.tsx`; modify `src/pages/ContestPage.tsx`, `src/pages/ContestPage.css`

- [ ] Move `VoteLightbox` and `WizardProgressBar` (adding optional `selectLabel`/`selectedLabel`/`capNote` props) and `shuffleArray`.
- [ ] `PointsBallot`:
  - steps: Theme rank tray (slots filled by tapping; move up/down; clear), Favorite (optional single), Bonus (optional single, if defined), Review
  - prune invalid picks when submissions change
  - Next is disabled until the required ranks are filled
  - Cast calls `castBallot`
- [ ] `PointsWinners` and `PointsFullResults` (points, ties, tiebreak note and legend; HM rows show no points).
- [ ] The ContestPage dispatchers `TabVote`, `TabWinners` and `TabFullResults` select by format; the classic implementations are renamed but unchanged. TabRules gets points copy for voting and active states.
- [ ] Add CSS for the rank tray, rank badges, points meta and legend (light/dark via tokens).

### Task 7: My Results refresh

**Files:** `src/pages/MyResultsPage.tsx`, `src/pages/MyResultsPage.css`

- [ ] Extract `HistoryGrid` (label column, header row, rows, its own scroll arrows).
- [ ] Overview:
  - all-time podium cards with a "N category · M overall" line when both formats exist
  - secondary cards: Points and #1 Theme Votes (when `hasPointsResults`), Podium Finishes, Contests Entered
- [ ] History:
  - points strip with rows "Overall" (best photo, medal) and "Points"
  - a classic archive section (explainer, Votes earned chip with rank, Best category chip) over the existing three-row grid
- [ ] Lightbox: points contests show the place or points badge, the breakdown and the tiebreak note; classic contests are unchanged.

### Task 8: Copy, admin, verification

**Files:** `src/components/ContestSection.tsx`, `src/pages/admin/ContestsSection.tsx`

- [ ] Home "What is the monthly contest?" copy; the admin format badge and Recalculate confirmation copy.
- [ ] `npx tsc --noEmit`, `npm run build`, `npm run lint`; the backend suite against local PG16.
- [ ] Code review pass (superpowers:requesting-code-review) and fix findings.
