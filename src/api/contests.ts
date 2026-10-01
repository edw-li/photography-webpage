import type { Contest, ContestSubmission, MyResultsResponse } from '../types/contest';
import { apiFetch } from './client';

export async function getContests(): Promise<Contest[]> {
  return apiFetch<Contest[]>('/contests/all');
}

export async function getLatestCompletedContest(): Promise<Contest | null> {
  // Completed contests sort most-recent first, so page 1 × size 1 is exactly
  // the latest one.
  const res = await apiFetch<{ items: Contest[] }>(
    '/contests?page=1&page_size=1&status=completed',
  );
  return res.items[0] ?? null;
}

export async function getVotingContest(): Promise<Contest | null> {
  // Status-filtered single-row query — much cheaper than /contests/all, which
  // serializes every submission of every contest. Should several contests ever
  // be in voting at once, backend ordering puts the soonest-closing one first.
  const res = await apiFetch<{ items: Contest[] }>(
    '/contests?page=1&page_size=1&status=voting',
  );
  return res.items[0] ?? null;
}

export interface ContestCreateData {
  month: string;
  theme: string;
  description: string;
  status: string;
  deadline: string;
  guidelines: string[];
  wildcardCategory?: string | null;
}

export async function createContest(data: ContestCreateData): Promise<Contest> {
  return apiFetch<Contest>('/contests', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface ContestUpdateData {
  month?: string;
  theme?: string;
  description?: string;
  status?: string;
  deadline?: string;
  guidelines?: string[];
  wildcardCategory?: string | null;
}

export async function updateContest(id: number, data: ContestUpdateData): Promise<Contest> {
  return apiFetch<Contest>(`/contests/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteContest(id: number): Promise<void> {
  await apiFetch(`/contests/${id}`, { method: 'DELETE' });
}

export async function getContest(id: number): Promise<Contest> {
  return apiFetch<Contest>(`/contests/${id}`);
}

export async function submitPhoto(contestId: number, formData: FormData): Promise<void> {
  await apiFetch(`/contests/${contestId}/submissions`, {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

export async function deleteSubmission(contestId: number, submissionId: number): Promise<void> {
  await apiFetch(`/contests/${contestId}/submissions/${submissionId}`, { method: 'DELETE' });
}

export async function castVote(
  contestId: number,
  votes: { category: string; submissionIds: number[] }[],
): Promise<void> {
  await apiFetch(`/contests/${contestId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ votes }),
  });
}

// --- Admin Import APIs ---

export async function uploadAdminSubmission(
  contestId: number,
  formData: FormData,
): Promise<void> {
  await apiFetch(`/contests/${contestId}/admin-submissions`, {
    method: 'POST',
    body: formData,
    headers: {},
  });
}

export interface SubmissionVoteTally {
  submissionId: number;
  theme: number;
  favorite: number;
  wildcard: number;
}

export async function finalizeContest(
  contestId: number,
  voteTallies: SubmissionVoteTally[],
): Promise<Contest> {
  return apiFetch<Contest>(`/contests/${contestId}/finalize`, {
    method: 'POST',
    body: JSON.stringify({ voteTallies }),
  });
}

export async function refreshGallery(contestId: number): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/contests/${contestId}/refresh-gallery`, {
    method: 'POST',
  });
}

export async function recalculateWinners(): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>('/contests/recalculate-winners', {
    method: 'POST',
  });
}

export async function backfillExif(contestId: number): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/contests/${contestId}/backfill-exif`, {
    method: 'POST',
  });
}

export async function assignSubmission(
  contestId: number,
  submissionId: number,
  data: { memberId: number | null; photographer: string },
): Promise<void> {
  await apiFetch(`/contests/${contestId}/submissions/${submissionId}/assign`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function getMyResults(): Promise<MyResultsResponse> {
  return apiFetch<MyResultsResponse>('/contests/my-results');
}

export interface MySubmissions {
  submissions: ContestSubmission[];
  userSubmissionCount: number;
  canManageSubmissions: boolean;
  submissionLockReason: string | null;
}

export interface PreparedSubmission {
  uploadId: string;
  previewUrl: string;
  expiresAt: string;
}

export interface SubmissionChange {
  operationId: string;
  expectedRevision?: number;
  uploadId?: string;
  title?: string;
}

export interface SubmissionChangeResult {
  operationId: string;
  submission: ContestSubmission | null;
  removedSubmissionId: number | null;
  userSubmissionCount: number;
}

async function withSubmissionTimeout<T>(request: (signal: AbortSignal) => Promise<T>, milliseconds = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), milliseconds);
  try { return await request(controller.signal); }
  finally { window.clearTimeout(timer); }
}

export function getMySubmissions(contestId: number): Promise<MySubmissions> {
  return withSubmissionTimeout(signal => apiFetch(`/contests/${contestId}/my-submissions`, { cache: 'no-store', signal }));
}

export function prepareSubmission(contestId: number, file: File, targetId?: number): Promise<PreparedSubmission> {
  const body = new FormData();
  body.append('file', file);
  if (targetId !== undefined) body.append('target_submission_id', String(targetId));
  return apiFetch(`/contests/${contestId}/submission-uploads`, { method: 'POST', body });
}

export function discardPreparedSubmission(contestId: number, uploadId: string): Promise<void> {
  return apiFetch(`/contests/${contestId}/submission-uploads/${uploadId}`, { method: 'DELETE' });
}

export function changeSubmission(
  contestId: number, action: 'add' | 'replace' | 'title' | 'remove',
  body: SubmissionChange, submissionId?: number,
): Promise<SubmissionChangeResult> {
  const path = `/contests/${contestId}/submissions${submissionId === undefined ? '' : `/${submissionId}`}`;
  const methods = { add: 'POST', replace: 'PUT', title: 'PATCH', remove: 'DELETE' };
  return withSubmissionTimeout(signal => apiFetch(path, { method: methods[action], body: JSON.stringify(body), signal }), 30000);
}

export function getSubmissionOperation(contestId: number, operationId: string): Promise<{
  state: 'unknown' | 'saved'; result?: SubmissionChangeResult;
}> {
  return withSubmissionTimeout(signal => apiFetch(`/contests/${contestId}/submission-operations/${operationId}`, { cache: 'no-store', signal }));
}
