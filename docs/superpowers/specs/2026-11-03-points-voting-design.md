# Points Voting & My Results Refresh — Design

Date: 2026-11-03 · Status: approved in conversation

## Goal

Replace the three-category approval ballot (Theme / Personal Favorite / Bonus Challenge,
up to 3 photos each, three separate podiums) with **one theme-weighted points
leaderboard**. Completed ("classic") contests keep their original rules and results.
My Results archives classic results and builds on them.

## Rules (member-facing)

- **Theme (main vote):** rank your top 3 photos for how well they capture the theme.
  1st = 3 pts, 2nd = 2 pts, 3rd = 1 pt. All three picks are required when at least
  three photos are eligible (otherwise rank every eligible photo).
- **Personal Favorite:** optional single pick, +1 pt.
- **Bonus Challenge:** optional single pick, +1 pt (only when the contest defines one).
- One voter may give the same photo a theme rank, their Favorite and their Bonus pick.
- No voting for your own photos. Ballots are final.
- **One leaderboard** by total points (8 points per full ballot; 7 without a bonus challenge).
- **Tiebreakers, in order:** total points → theme points → #1 theme votes → #2 theme votes.
  Photos still tied **share the place**, numbered 1, 1, 3 (standard competition ranking).
  The podium is places 1–3 with more than 0 points. Submission time is never a tiebreaker.
- Never call this "ranked choice" (that implies instant-runoff).

## Cutover

- `contests.voting_format` is `classic` or `points`. The migration marks completed
  contests, contests in voting, and any contest that already has ballots as `classic`;
  everything else (and every new contest) is `points`. Contests an admin creates directly
  as `completed` (the historical import flow) are `classic`.
- The contest in voting at cutover (October 2026) switches through a deliberate one-off
  script run after deploy, `backend/scripts/switch_contest_to_points.py`: archive its
  ballots to `contest_vote_archive`, delete them, set the format to `points`, and notify
  the affected voters (`contest_revote`). Migrations auto-run on backend start, so this
  must not be a migration. Its voting deadline stays as-is for now.
- The format is not editable through the API.

## Backend

- **Models:** `Contest.voting_format`; `ContestVote.rank` (nullable; theme rows of a points
  ballot are 1–3) with a partial unique index on (contest, user, category, rank) where
  rank is not null; new `ContestVoteArchive` table.
- **Scoring:** `app/services/points_scoring.py`, pure functions: tally, competition ranking
  with the tiebreak cascade, a tiebreak annotation, and winners (`category: "overall"`).
- **Voting:** `POST /contests/{id}/vote` accepts `{votes}` (classic) or
  `{ballot: {theme: [ids in rank order], favorite, bonus}}` (points). A classic body on a
  points contest returns 409 "Voting has changed for this contest. Please refresh the
  page and vote again."
- **Completion and Recalculate Winners** dispatch on the format; the classic path is unchanged.
  - When a points contest completes, each photo's result (rank counts, favorite, bonus,
    rank, tiebreak) is frozen in `contest_submissions.points_score`, and `vote_count`
    stores the total.
  - Responses serve the frozen results, so a member or photo deleted later can't
    reshuffle a finished leaderboard.
  - Recalculate re-ranks the frozen results instead of re-reading ballots.
  - Reverting a completed contest clears them.
- **Constraints:** CHECK constraints guard `voting_format` and `rank` (1–3).
- **Contest response:** adds `votingFormat`. Completed points contests attach a `score` to
  every submission: total, theme points, theme 1st/2nd/3rd counts, favorite, bonus, rank,
  and tiebreak.
- **My Results:** each contest carries `votingFormat`. Classic contests keep their
  theme/favorite/wildcard results; points contests get `overallResult` (best place, best
  points, total points, per-photo place and score).
  - Medal counts, podiums and their ranks are all-time: classic category placements plus
    overall placements.
  - `totalVotes` and `bestCategory` are classic-only.
  - New fields: overall place counts, `totalPoints`, `firstChoiceVotes` (each with a rank),
    `hasPointsResults`, `hasClassicResults`.
- **Notifications:** new type `contest_revote`.

## Frontend

- **Ballot (points):** Theme step with a 3-slot rank tray (tapping a photo fills the next
  empty slot; slots can be moved up/down or cleared) → Personal Favorite (optional, single)
  → Bonus Challenge (optional, single, only if defined) → Review → Cast ballot. The classic
  wizard stays for classic contests still in voting.
- **Rules tab:** points rules copy. Classic copy is kept for classic contests.
- **Winners (points):** a single podium with points, shared places ("2-way tie"), and a
  tiebreak note. **Full Results (points):** one ranked list. Places outside the podium show
  "HM" with no points, plus a tiebreak legend. Classic tabs are unchanged.
- **"Overall" label** in the gallery lightbox, home showcase and admin; the showcase includes
  overall winners. The home "What is the monthly contest?" copy describes the new rules.
- **My Results:**
  - Headline: all-time 1st/2nd/3rd with an "N category + M overall" breakdown.
  - Secondary cards: Points and #1 Theme Votes (only once the member has points results),
    then Podium Finishes and Contests Entered.
  - Competition History: a points-leaderboard strip with one cell per contest (best photo,
    medal, points), plus the classic three-row grid as a labelled archive carrying the frozen
    "Votes earned" and "Best category".
  - The lightbox shows each photo's points breakdown and any tiebreak note. No rank number
    is shown below 3rd.
- **Admin:** a voting-format badge in the contests table, and Recalculate Winners copy that
  explains the per-format rules.

## Testing

- Pure scoring unit tests (no DB).
- DB-backed tests (isolated schema, `TEST_DATABASE_URL`):
  - ballot validation
  - stale classic body rejected
  - completion produces points and overall winners
  - recalculation leaves classic contests untouched
  - My Results across both formats
  - the switch script
- Frontend: `tsc`, `npm run build`, `npm run lint`.

## Out of scope

Per-contest voting deadline override (add later if October needs more time),
Favorite/Bonus badges, points-format imports.
