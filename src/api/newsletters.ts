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

export interface NewsletterWithBody extends Newsletter {
  bodyMd: string;
}

export async function getNewsletter(id: string): Promise<NewsletterWithBody> {
  return apiFetch<NewsletterWithBody>(`/newsletters/${id}`);
}

export async function getNewsletterCategories(): Promise<string[]> {
  return apiFetch<string[]>('/newsletters/categories');
}

export interface NewsletterCreateData {
  id: string;
  title: string;
  date: string;
  category: string;
  author: string;
  preview: string;
  featured: boolean;
  bodyMd: string;
  sendToSubscribers?: boolean;
}

export interface NewsletterSendResult {
  newsletterId: string;
  totalSubscribers: number;
  sentCount: number;
  failedCount: number;
  emailedAt: string;
}

export async function createNewsletter(data: NewsletterCreateData): Promise<Newsletter> {
  return apiFetch<Newsletter>('/newsletters', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateNewsletter(id: string, data: Partial<NewsletterCreateData>): Promise<Newsletter> {
  return apiFetch<Newsletter>(`/newsletters/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteNewsletter(id: string): Promise<void> {
  await apiFetch(`/newsletters/${id}`, { method: 'DELETE' });
}

export async function sendNewsletter(id: string): Promise<NewsletterSendResult> {
  return apiFetch<NewsletterSendResult>(`/newsletters/${id}/send`, {
    method: 'POST',
  });
}

interface SubscribeData {
  name: string;
  email: string;
  hp?: string;
  turnstileToken?: string | null;
}

export async function subscribeToNewsletter(data: SubscribeData): Promise<void> {
  await apiFetch('/newsletters/subscribe', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
