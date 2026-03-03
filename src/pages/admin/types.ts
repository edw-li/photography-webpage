export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface ContactItem {
  id: number;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

export interface SubscriberItem {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  subscribedAt: string;
}

export interface ContestItem {
  id: number;
  month: string;
  theme: string;
  description: string;
  status: string;
  deadline: string;
  submissionCount: number;
  participantCount: number;
  guidelines: string[];
  submissions: ContestSubmissionItem[];
  winners?: { submissionId: number; place: number }[] | null;
  honorableMentions?: { submissionId: number }[] | null;
}

export interface ContestSubmissionItem {
  id: number;
  url: string;
  title: string;
  photographer: string;
  votes?: number | null;
}

export interface ActivityItem {
  id: number;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  adminEmail: string;
  createdAt: string;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
