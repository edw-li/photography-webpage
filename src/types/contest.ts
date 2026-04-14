import type { PhotoExif } from './gallery';

export type VoteCategory = 'theme' | 'favorite' | 'wildcard';

export interface CategoryVotes {
  theme: number;
  favorite: number;
  wildcard: number;
}

export interface ContestSubmission {
  id: number;
  url: string;
  title: string;
  photographer: string;
  votes?: number;
  exif?: PhotoExif;
  categoryVotes?: CategoryVotes;
}

export type ContestStatus = 'active' | 'voting' | 'completed';

export interface ContestWinner {
  submissionId: number;
  place: 1 | 2 | 3;
  category: VoteCategory;
}

export interface HonorableMention {
  submissionId: number;
  category: VoteCategory;
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
  submissions: ContestSubmission[];
  winners?: ContestWinner[];
  honorableMentions?: HonorableMention[];
  userSubmissionCount?: number | null;
  userHasVoted?: boolean | null;
}

export function getCategoryLabel(cat: VoteCategory, wildcardLabel?: string | null): string {
  switch (cat) {
    case 'theme':
      return 'Best Addresses the Theme';
    case 'favorite':
      return 'Personal Favorite';
    case 'wildcard':
      return wildcardLabel || 'Bonus Challenge';
  }
}
