import type { CalendarEvent } from '../types/events';
import { apiFetch } from './client';

export async function getEvents(): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>('/events/all');
}
