export type AnnouncementSeverity = 'info' | 'warning' | 'critical';
export type AnnouncementAudience = 'public' | 'authenticated' | 'admin';
export type AnnouncementStatus = 'active' | 'scheduled' | 'ended' | 'inactive';

export interface ActiveAnnouncement {
  id: string;
  title: string;
  html: string;
  severity: AnnouncementSeverity;
  isDismissable: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
}

export interface Announcement {
  id: string;
  title: string;
  bodyMd: string;
  html: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  priority: number;
  isDismissable: boolean;
  ctaLabel: string | null;
  ctaUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  dismissalCount: number;
}
