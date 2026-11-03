import type { PhotoExif } from './gallery';

export type VoteCategory = 'theme' | 'favorite' | 'wildcard';

/** Category a placement was won in: one of the classic ballot categories, or
    'overall' for the single points leaderboard. */
export type PlacementCategory = VoteCategory | 'overall';

/** How a contest is voted on and scored.
    - 'classic': approve up to 3 photos in each of three categories, three
      separate podiums (every contest completed before November 2026).
    - 'points': rank the top 3 photos for the theme (3 / 2 / 1 pts) plus one
      Personal Favorite point and one Bonus Challenge point; one leaderboard. */
export type VotingFormat = 'classic' | 'points';

/** Tiebreaker that ordered a points photo against another with the same total. */
export type PointsTiebreak = 'theme_points' | 'first_choice' | 'second_choice';

export interface CategoryVotes {
  theme: number;
  favorite: number;
  wildcard: number;
}

/** A photo's result in a completed points contest. */
export interface PointsScore {
  total: number;
  themePoints: number;
  /** How many voters ranked the photo 1st / 2nd / 3rd for the theme. */
  themeFirst: number;
  themeSecond: number;
  themeThird: number;
  /** Personal Favorite and Bonus Challenge picks (1 point each). */
  favorite: number;
  bonus: number;
  /** Leaderboard rank (1-based). Fully tied photos share it: 1, 1, 3. */
  rank: number;
  tiebreak?: PointsTiebreak | null;
}

export interface ContestSubmission {
  id: number;
  url: string;
  title: string;
  photographer: string;
  isAssigned?: boolean;
  isOwn?: boolean;
  votes?: number;
  exif?: PhotoExif;
  /** Classic contests, once completed. */
  categoryVotes?: CategoryVotes;
  /** Points contests, once completed. */
  score?: PointsScore | null;
  /** ISO submission time — orders tied placements. Absent during anonymous voting. */
  createdAt?: string | null;
  revision: number;
  updatedAt?: string | null;
  imageSubmittedAt?: string | null;
}

export type ContestStatus = 'upcoming' | 'active' | 'voting' | 'completed';

export interface ContestWinner {
  submissionId: number;
  /** Ties share a place, so there may be several of each. */
  place: 1 | 2 | 3;
  category: PlacementCategory;
}

export interface Contest {
  id: number;
  month: string;
  theme: string;
  description: string;
  status: ContestStatus;
  deadline: string;
  submissionCount: number;
  participantCount: number;
  guidelines: string[];
  wildcardCategory?: string | null;
  isImported?: boolean;
  /** Absent only from a backend that predates points voting: treat as classic. */
  votingFormat?: VotingFormat;
  submissions: ContestSubmission[];
  winners?: ContestWinner[];
  userSubmissionCount?: number | null;
  userHasVoted?: boolean | null;
  canManageSubmissions?: boolean;
  submissionLockReason?: string | null;
}

/** One submission's tally from the ballots cast so far (admin debugging view). */
export interface LiveTally {
  submissionId: number;
  /** Points contests. */
  score?: PointsScore | null;
  /** Classic contests. */
  categoryVotes?: CategoryVotes | null;
}

/** Admin-only tallies while a contest is being voted on; submissions best-first. */
export interface LiveTallies {
  contestId: number;
  votingFormat: VotingFormat;
  status: ContestStatus;
  /** Members who have cast a ballot so far. */
  ballots: number;
  submissions: LiveTally[];
}

export function isPointsContest(contest: { votingFormat?: VotingFormat | null }): boolean {
  return contest.votingFormat === 'points';
}

/** Points per theme rank on a points ballot; index 0 is the 1st choice. */
export const THEME_RANK_POINTS = [3, 2, 1] as const;

/** One-sentence tiebreak rule for points contests (rules, legends). */
export const POINTS_TIEBREAK_RULE =
  'Ties are broken by theme points, then #1 theme votes, then #2 theme votes. Photos still tied share the place.';

export function getCategoryLabel(cat: PlacementCategory, wildcardLabel?: string | null): string {
  switch (cat) {
    case 'theme':
      return 'Best Addresses the Theme';
    case 'favorite':
      return 'Personal Favorite';
    case 'wildcard':
      return wildcardLabel || 'Bonus Challenge';
    case 'overall':
      return 'Overall';
  }
}

/** Short name of the tiebreaker, shown as "Tied on points · ordered by {label}". */
export function tiebreakLabel(tiebreak: PointsTiebreak): string {
  switch (tiebreak) {
    case 'theme_points':
      return 'theme points';
    case 'first_choice':
      return '#1 theme votes';
    case 'second_choice':
      return '#2 theme votes';
  }
}

/** "1 pt" / "24 pts". */
export function formatPoints(points: number): string {
  return `${points} ${points === 1 ? 'pt' : 'pts'}`;
}

// --- My Results types ---

export interface SubmissionResult {
  submissionId: number;
  url: string;
  title: string;
  photographer: string;
  place?: number | null;
  exif?: PhotoExif | null;
}

export interface CategoryResult {
  hasSubmission: boolean;
  bestPlace?: number | null;
  submissions: SubmissionResult[];
}

/** One of the member's photos in a points contest. */
export interface PointsSubmissionResult {
  submissionId: number;
  url: string;
  title: string;
  photographer: string;
  /** 1-3 when the photo made the podium. */
  place?: number | null;
  score: PointsScore;
  exif?: PhotoExif | null;
}

/** The member's result in one points contest; photos are ordered best-first. */
export interface OverallResult {
  bestPlace?: number | null;
  /** Points of the member's top-scoring photo. */
  bestPoints: number;
  /** Points across all of the member's photos in the contest. */
  totalPoints: number;
  submissions: PointsSubmissionResult[];
}

export interface MyResultsContest {
  contestId: number;
  month: string;
  theme: string;
  votingFormat: VotingFormat;
  wildcardCategory?: string | null;
  hasWildcard: boolean;
  /** Classic contests only. */
  themeResult?: CategoryResult | null;
  favoriteResult?: CategoryResult | null;
  wildcardResult?: CategoryResult | null;
  /** Points contests only. */
  overallResult?: OverallResult | null;
}

export interface LeaderboardRanking {
  value: number;
  rank: number;
  totalMembers: number;
}

export interface MyResultsStats {
  totalSubmissions: number;
  /** Votes received in classic contests (points contests award points instead). */
  totalVotes: number;
  /** All-time: classic category placements plus overall points placements. */
  firstPlaceFinishes: number;
  secondPlaceFinishes: number;
  thirdPlaceFinishes: number;
  podiumFinishes: number;
  contestsEntered: number;
  totalCompletedContests: number;
  participationRate: number;
  /** Classic contests only: the category with the most placements. */
  bestCategory?: string | null;
  /** Points contests only. */
  overallFirstPlaceFinishes: number;
  overallSecondPlaceFinishes: number;
  overallThirdPlaceFinishes: number;
  totalPoints: number;
  /** Times a voter ranked one of the member's photos 1st for the theme. */
  firstChoiceVotes: number;
  hasClassicResults: boolean;
  hasPointsResults: boolean;
}

export interface MyResultsLeaderboard {
  firstPlace: LeaderboardRanking;
  secondPlace: LeaderboardRanking;
  thirdPlace: LeaderboardRanking;
  totalPodium: LeaderboardRanking;
  /** Classic contests only. */
  totalVotes: LeaderboardRanking;
  /** Points contests only. */
  totalPoints: LeaderboardRanking;
  firstChoiceVotes: LeaderboardRanking;
}

export interface MyResultsResponse {
  stats: MyResultsStats;
  leaderboard: MyResultsLeaderboard;
  contests: MyResultsContest[];
}
