import type { GalleryPhoto, PhotoExif } from '../types/gallery';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export async function getGalleryPhotos(
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<GalleryPhoto>> {
  return apiFetch<PaginatedResponse<GalleryPhoto>>(
    `/gallery?page=${page}&page_size=${pageSize}`,
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
