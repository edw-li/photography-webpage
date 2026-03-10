import type { GalleryPhoto, PhotoExif } from '../types/gallery';
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
