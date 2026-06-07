import type { ReleaseNote } from '../types/releaseNotes';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** Public list — published release notes only, newest first. */
export async function getReleaseNotes(
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<ReleaseNote>> {
  return apiFetch<PaginatedResponse<ReleaseNote>>(
    `/release-notes?page=${page}&page_size=${pageSize}`,
  );
}

/** Admin list — all release notes (published + drafts), newest first. */
export async function getReleaseNotesAdmin(
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<ReleaseNote>> {
  return apiFetch<PaginatedResponse<ReleaseNote>>(
    `/release-notes/admin?page=${page}&page_size=${pageSize}`,
  );
}

export interface ReleaseNoteCreateData {
  version: string;
  date: string;
  bodyMd: string;
  isPublished: boolean;
}

export async function createReleaseNote(data: ReleaseNoteCreateData): Promise<ReleaseNote> {
  return apiFetch<ReleaseNote>('/release-notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateReleaseNote(
  id: number,
  data: Partial<ReleaseNoteCreateData>,
): Promise<ReleaseNote> {
  return apiFetch<ReleaseNote>(`/release-notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Flip a release note's published/draft state. */
export async function toggleReleaseNotePublished(id: number): Promise<ReleaseNote> {
  return apiFetch<ReleaseNote>(`/release-notes/${id}`, { method: 'PATCH' });
}

export async function deleteReleaseNote(id: number): Promise<void> {
  await apiFetch(`/release-notes/${id}`, { method: 'DELETE' });
}
