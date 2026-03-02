import type { Contest } from '../types/contest';
import { apiFetch } from './client';

export async function getContests(): Promise<Contest[]> {
  return apiFetch<Contest[]>('/contests/all');
}

export interface ContestCreateData {
  month: string;
  theme: string;
  description: string;
  status: string;
  deadline: string;
  guidelines: string[];
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
  winners?: { submissionId: number; place: number }[];
  honorableMentions?: { submissionId: number }[];
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

export async function castVote(contestId: number, submissionId: number): Promise<void> {
  await apiFetch(`/contests/${contestId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ submissionId }),
  });
}
