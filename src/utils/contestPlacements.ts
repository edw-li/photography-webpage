import type { Contest, ContestSubmission, PlacementCategory, VoteCategory } from '../types/contest';

/**
 * Placement helpers for completed contests.
 *
 * Classic contests (dense ranking — mirrors _rank_for_category in
 * backend/app/api/contests.py): every submission whose tally is among the top
 * three distinct positive vote counts places; ties share the place, so a
 * category may have several firsts, seconds, or thirds. Within a place,
 * earlier submissions are shown first.
 *
 * Points contests: the backend ranks the single leaderboard (total points,
 * then theme points, #1 votes, #2 votes; full ties share the place as 1, 1, 3)
 * and sends each submission's `score`; placements use category 'overall'.
 */

/** Full Results lists this many rows, but never cuts off a medalist. */
export const FULL_RESULTS_CAP = 10;

export function getCategoryVotes(sub: ContestSubmission, category: VoteCategory): number {
  return sub.categoryVotes ? sub.categoryVotes[category] : (sub.votes ?? 0);
}

/** The tally a placement is judged on: points for 'overall', else category votes. */
export function placementScore(sub: ContestSubmission, category: PlacementCategory): number {
  return category === 'overall' ? (sub.score?.total ?? 0) : getCategoryVotes(sub, category);
}

function submissionTime(sub: ContestSubmission): number {
  if (sub.imageSubmittedAt || sub.createdAt) {
    const t = Date.parse(sub.imageSubmittedAt || sub.createdAt!);
    if (!Number.isNaN(t)) return t;
  }
  // Unknown time sorts after known times; the id tiebreak below still keeps
  // the order deterministic (ids are assigned in submission order).
  return Number.MAX_SAFE_INTEGER;
}

export function compareBySubmissionTime(a: ContestSubmission, b: ContestSubmission): number {
  return submissionTime(a) - submissionTime(b) || a.id - b.id;
}

export interface RankedSubmission {
  sub: ContestSubmission;
  votes: number;
  /** 1 = best; ties share the rank (classic: dense ranking; points: the
      backend's competition ranking, numbered 1, 1, 3). */
  rank: number;
  /** Gold/silver/bronze accent: a podium place with a positive tally. */
  isMedal: boolean;
}

/** Rank every submission in a category: votes desc, earlier submission first
    within a tie, dense rank assigned down the whole list. */
export function rankSubmissions(
  submissions: ContestSubmission[],
  category: VoteCategory,
): RankedSubmission[] {
  const sorted = submissions
    .map((sub) => ({ sub, votes: getCategoryVotes(sub, category) }))
    .sort((a, b) => b.votes - a.votes || compareBySubmissionTime(a.sub, b.sub));

  let rank = 0;
  let prevVotes: number | null = null;
  return sorted.map(({ sub, votes }) => {
    if (votes !== prevVotes) {
      rank += 1;
      prevVotes = votes;
    }
    return { sub, votes, rank, isMedal: rank <= 3 && votes > 0 };
  });
}

/** Rank a completed points contest's submissions as the backend scored them:
    leaderboard rank, then earlier submission within a full tie. `votes` holds
    total points. Photos without a score (never expected once completed) sort
    last and never medal. */
export function rankByPoints(submissions: ContestSubmission[]): RankedSubmission[] {
  return submissions
    .map((sub) => ({
      sub,
      votes: sub.score?.total ?? 0,
      rank: sub.score?.rank ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.rank - b.rank || compareBySubmissionTime(a.sub, b.sub))
    .map((row) => ({ ...row, isMedal: row.sub.score != null && row.rank <= 3 && row.votes > 0 }));
}

export interface PlacementGroups {
  first: RankedSubmission[];
  second: RankedSubmission[];
  third: RankedSubmission[];
}

/** Group a completed contest's winners for one category by place.

    Trusts the backend-assigned place (the source of truth for placements);
    the tally (votes, or points for 'overall') is attached for display only.
    Winners whose submission is missing (deleted after completion) are
    dropped. */
export function groupWinnersByPlace(contest: Contest, category: PlacementCategory): PlacementGroups {
  const subById = new Map(contest.submissions.map((s) => [s.id, s]));
  const groups: PlacementGroups = { first: [], second: [], third: [] };
  for (const w of contest.winners ?? []) {
    if ((w.category || 'theme') !== category) continue;
    const sub = subById.get(w.submissionId);
    if (!sub) continue;
    const row: RankedSubmission = {
      sub,
      votes: placementScore(sub, category),
      rank: w.place,
      isMedal: true,
    };
    if (w.place === 1) groups.first.push(row);
    else if (w.place === 2) groups.second.push(row);
    else if (w.place === 3) groups.third.push(row);
  }
  const byTime = (a: RankedSubmission, b: RankedSubmission) => compareBySubmissionTime(a.sub, b.sub);
  groups.first.sort(byTime);
  groups.second.sort(byTime);
  groups.third.sort(byTime);
  return groups;
}

export function medalColor(place: number): string | undefined {
  if (place === 1) return '#FFD700';
  if (place === 2) return '#C0C0C0';
  if (place === 3) return '#CD7F32';
  return undefined;
}

export function placeLabel(place: number): string {
  if (place === 1) return '1st Place';
  if (place === 2) return '2nd Place';
  return '3rd Place';
}
