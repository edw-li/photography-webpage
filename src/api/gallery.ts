import type { GalleryPhoto } from '../types/gallery';
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
