import type {
  ActiveAnnouncement,
  Announcement,
  AnnouncementAudience,
  AnnouncementSeverity,
  AnnouncementStatus,
} from '../types/announcement';
import { apiFetch } from './client';

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export interface AnnouncementListFilters {
  audience?: AnnouncementAudience;
  severity?: AnnouncementSeverity;
  status?: AnnouncementStatus;
}

export interface AnnouncementWriteData {
  id?: string;
  title: string;
  bodyMd: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  priority: number;
  isDismissable: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
}

export async function getActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
  return apiFetch<ActiveAnnouncement | null>('/announcements/active');
}

export async function dismissAnnouncement(id: string): Promise<void> {
  await apiFetch(`/announcements/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
  });
}

export async function getAnnouncements(
  page = 1,
  pageSize = 20,
  filters: AnnouncementListFilters = {},
): Promise<PaginatedResponse<Announcement>> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (filters.audience) params.set('audience', filters.audience);
  if (filters.severity) params.set('severity', filters.severity);
  if (filters.status) params.set('status', filters.status);
  return apiFetch<PaginatedResponse<Announcement>>(`/announcements?${params.toString()}`);
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  return apiFetch<Announcement>(`/announcements/${encodeURIComponent(id)}`);
}

export async function createAnnouncement(
  data: AnnouncementWriteData & { id: string },
): Promise<Announcement> {
  return apiFetch<Announcement>('/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAnnouncement(
  id: string,
  data: Partial<AnnouncementWriteData>,
): Promise<Announcement> {
  return apiFetch<Announcement>(`/announcements/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function toggleAnnouncementActive(id: string): Promise<Announcement> {
  return apiFetch<Announcement>(`/announcements/${encodeURIComponent(id)}/active`, {
    method: 'PATCH',
  });
}

export async function resetAnnouncementDismissals(id: string): Promise<void> {
  await apiFetch(`/announcements/${encodeURIComponent(id)}/reset-dismissals`, {
    method: 'POST',
  });
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await apiFetch(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
