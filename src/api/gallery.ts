import type { GalleryPhoto, PhotoExif } from '../types/gallery';
import type { GalleryComment } from '../types/comments';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface GalleryFetchOptions {
  winnersOnly?: boolean;
  includeHidden?: boolean;
}

export async function getGalleryPhotos(
  page = 1,
  pageSize = 100,
  options?: GalleryFetchOptions,
): Promise<PaginatedResponse<GalleryPhoto>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (options?.winnersOnly !== undefined) {
    params.set('winners_only', String(options.winnersOnly));
  }
  if (options?.includeHidden !== undefined) {
    params.set('include_hidden', String(options.includeHidden));
  }
  return apiFetch<PaginatedResponse<GalleryPhoto>>(
    `/gallery?${params.toString()}`,
  );
}

export async function getGalleryPhoto(id: number): Promise<GalleryPhoto> {
  return apiFetch<GalleryPhoto>(`/gallery/${id}`);
}

export interface GalleryPhotoCreateData {
  url: string;
  title: string;
  photographer: string;
  memberId?: number | null;
  exif?: PhotoExif | null;
}

export async function createGalleryPhoto(data: GalleryPhotoCreateData): Promise<GalleryPhoto> {
  return apiFetch<GalleryPhoto>('/gallery', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGalleryPhoto(id: number, data: Partial<GalleryPhotoCreateData>): Promise<GalleryPhoto> {
  return apiFetch<GalleryPhoto>(`/gallery/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGalleryPhoto(id: number): Promise<void> {
  await apiFetch(`/gallery/${id}`, { method: 'DELETE' });
}

export async function toggleGalleryVisibility(id: number): Promise<GalleryPhoto> {
  return apiFetch<GalleryPhoto>(`/gallery/${id}/visibility`, {
    method: 'PATCH',
  });
}

// Likes

export async function likePhoto(id: number): Promise<{ liked: boolean }> {
  return apiFetch<{ liked: boolean }>(`/gallery/${id}/like`, {
    method: 'POST',
  });
}

export async function unlikePhoto(id: number): Promise<void> {
  await apiFetch(`/gallery/${id}/like`, { method: 'DELETE' });
}

export async function getPhotoLikesCount(id: number): Promise<{ count: number }> {
  return apiFetch<{ count: number }>(`/gallery/${id}/likes/count`);
}

// Comments

export async function getPhotoComments(
  photoId: number,
  page = 1,
  pageSize = 20,
): Promise<PaginatedResponse<GalleryComment>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  return apiFetch<PaginatedResponse<GalleryComment>>(
    `/gallery/${photoId}/comments?${params.toString()}`,
  );
}

export async function postPhotoComment(
  photoId: number,
  body: string,
  parentId?: number | null,
): Promise<GalleryComment> {
  return apiFetch<GalleryComment>(`/gallery/${photoId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, parentId: parentId ?? null }),
  });
}

export async function editPhotoComment(
  commentId: number,
  body: string,
): Promise<GalleryComment> {
  return apiFetch<GalleryComment>(`/gallery/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export async function deletePhotoComment(commentId: number): Promise<void> {
  await apiFetch(`/gallery/comments/${commentId}`, { method: 'DELETE' });
}
