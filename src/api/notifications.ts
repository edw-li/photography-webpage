import { apiFetch } from './client';
import type { AppNotification, NotificationType } from '../types/notifications';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

// Cross-component signal: any unread-count change (mark read, mark all) dispatches
// this event so subscribers (the navbar badge) can refresh without polling.
export const UNREAD_COUNT_EVENT = 'unread-count-changed';

function emitUnreadChanged(): void {
  window.dispatchEvent(new CustomEvent(UNREAD_COUNT_EVENT));
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  types?: NotificationType[];
}

export async function listNotifications(
  page = 1,
  pageSize = 20,
  options: ListNotificationsOptions = {},
): Promise<PaginatedResponse<AppNotification>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (options.unreadOnly) params.set('unread_only', 'true');
  if (options.types && options.types.length > 0) {
    for (const t of options.types) params.append('type', t);
  }
  return apiFetch<PaginatedResponse<AppNotification>>(
    `/notifications?${params.toString()}`,
  );
}

export async function getUnreadCount(): Promise<{ count: number }> {
  return apiFetch<{ count: number }>('/notifications/unread-count');
}

export async function markNotificationRead(id: number): Promise<void> {
  await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
  emitUnreadChanged();
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiFetch('/notifications/mark-all-read', { method: 'POST' });
  emitUnreadChanged();
}
