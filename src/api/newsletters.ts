import type { Newsletter } from '../types/newsletter';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export async function getNewsletters(
  page = 1,
  pageSize = 100,
): Promise<PaginatedResponse<Newsletter>> {
  return apiFetch<PaginatedResponse<Newsletter>>(
    `/newsletters?page=${page}&page_size=${pageSize}`,
  );
}

interface SubscribeData {
  name: string;
  email: string;
}

export async function subscribeToNewsletter(data: SubscribeData): Promise<void> {
  await apiFetch('/newsletters/subscribe', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
