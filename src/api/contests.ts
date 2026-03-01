import type { Contest } from '../types/contest';
import { apiFetch } from './client';

export async function getContests(): Promise<Contest[]> {
  return apiFetch<Contest[]>('/contests/all');
}

// For future use in Phase 5 (Auth UI):
export async function submitPhoto(contestId: number, formData: FormData): Promise<void> {
  await apiFetch(`/contests/${contestId}/submissions`, {
    method: 'POST',
    body: formData,
    headers: {},  // let browser set multipart Content-Type
  });
}

export async function castVote(contestId: number, submissionId: number): Promise<void> {
  await apiFetch(`/contests/${contestId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ submissionId }),
  });
}
