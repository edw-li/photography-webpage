import type { PhotoExif } from './gallery';

export interface ContestSubmission {
  id: number;
  url: string;
  title: string;
  photographer: string;
  votes?: number;
  exif?: PhotoExif;
}

export type ContestStatus = 'active' | 'voting' | 'completed';

export interface ContestWinner {
  submissionId: number;
  place: 1 | 2 | 3;
}

export interface HonorableMention {
  submissionId: number;
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
  submissions: ContestSubmission[];
  winners?: ContestWinner[];
  honorableMentions?: HonorableMention[];
}
