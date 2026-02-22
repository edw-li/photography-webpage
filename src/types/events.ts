export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type WeekOfMonth = 1 | 2 | 3 | 4 | 5;
export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  dayOfWeek?: DayOfWeek[];
  weekOfMonth?: WeekOfMonth[];
  endDate?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  time: string;
  endTime?: string;
  date: string;
  recurrence: RecurrenceRule | null;
}

export interface ResolvedEvent {
  eventId: string;
  date: string;
  event: CalendarEvent;
}

export interface EventsConfig {
  events: CalendarEvent[];
}
