import type { CalendarEvent } from '../types/events';
import { apiFetch } from './client';

export async function getEvents(): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>('/events/all');
}

export async function createEvent(data: Omit<CalendarEvent, 'recurrence'> & { recurrence?: CalendarEvent['recurrence'] }): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateEvent(id: string, data: Partial<CalendarEvent>): Promise<CalendarEvent> {
  return apiFetch<CalendarEvent>(`/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteEvent(id: string): Promise<void> {
  await apiFetch(`/events/${id}`, { method: 'DELETE' });
}
