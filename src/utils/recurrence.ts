import type { CalendarEvent, DayOfWeek, ResolvedEvent } from '../types/events';

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function getNthWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: DayOfWeek,
  n: number
): Date | null {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  let dayOffset = dayOfWeek - firstDayOfWeek;
  if (dayOffset < 0) dayOffset += 7;
  const date = 1 + dayOffset + (n - 1) * 7;
  if (date > getDaysInMonth(year, month)) return null;
  return new Date(year, month, date);
}

export function formatTime(time: string): string {
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${m} ${ampm}`;
}

function isInRange(dateStr: string, anchorStr: string, endDateStr?: string): boolean {
  if (dateStr < anchorStr) return false;
  if (endDateStr && dateStr > endDateStr) return false;
  return true;
}

function expandOneTime(event: CalendarEvent, year: number, month: number): ResolvedEvent[] {
  const d = parseDate(event.date);
  if (d.getFullYear() === year && d.getMonth() === month) {
    return [{ eventId: event.id, date: event.date, event }];
  }
  return [];
}

function expandWeekly(event: CalendarEvent, year: number, month: number): ResolvedEvent[] {
  const results: ResolvedEvent[] = [];
  const rule = event.recurrence!;
  const interval = rule.interval ?? 1;
  const daysOfWeek = rule.dayOfWeek ?? [];
  const anchor = parseDate(event.date);
  const monthStart = new Date(year, month, 1);
  const daysInMonth = getDaysInMonth(year, month);
  const monthEnd = new Date(year, month, daysInMonth);

  for (const dow of daysOfWeek) {
    // Find the first occurrence of this day of week on or after anchor
    const anchorDow = anchor.getDay();
    let dayOffset = dow - anchorDow;
    if (dayOffset < 0) dayOffset += 7;
    const firstOccurrence = new Date(anchor.getTime());
    firstOccurrence.setDate(firstOccurrence.getDate() + dayOffset);

    // Step size in days
    const step = interval * 7;

    // If first occurrence is after monthEnd, skip
    if (firstOccurrence > monthEnd) continue;

    // Calculate how many steps to reach at least monthStart
    let current: Date;
    if (firstOccurrence >= monthStart) {
      current = firstOccurrence;
    } else {
      const diffDays = Math.floor(
        (monthStart.getTime() - firstOccurrence.getTime()) / (1000 * 60 * 60 * 24)
      );
      const stepsNeeded = Math.floor(diffDays / step);
      current = new Date(firstOccurrence.getTime());
      current.setDate(current.getDate() + stepsNeeded * step);
      if (current < monthStart) {
        current.setDate(current.getDate() + step);
      }
    }

    while (current <= monthEnd) {
      if (current.getMonth() === month && current.getFullYear() === year) {
        const dateStr = formatDate(current);
        if (isInRange(dateStr, event.date, rule.endDate)) {
          results.push({ eventId: event.id, date: dateStr, event });
        }
      }
      current = new Date(current.getTime());
      current.setDate(current.getDate() + step);
    }
  }

  return results;
}

function expandMonthly(event: CalendarEvent, year: number, month: number): ResolvedEvent[] {
  const results: ResolvedEvent[] = [];
  const rule = event.recurrence!;
  const interval = rule.interval ?? 1;
  const anchor = parseDate(event.date);

  // Check if this month is valid based on interval from anchor
  const anchorMonth = anchor.getFullYear() * 12 + anchor.getMonth();
  const targetMonth = year * 12 + month;
  const diff = targetMonth - anchorMonth;
  if (diff < 0 || diff % interval !== 0) return results;

  if (rule.weekOfMonth && rule.dayOfWeek) {
    // Nth weekday of month pattern
    for (const week of rule.weekOfMonth) {
      for (const dow of rule.dayOfWeek) {
        const date = getNthWeekdayOfMonth(year, month, dow, week);
        if (date) {
          const dateStr = formatDate(date);
          if (isInRange(dateStr, event.date, rule.endDate)) {
            results.push({ eventId: event.id, date: dateStr, event });
          }
        }
      }
    }
  } else {
    // Same day of month, clamping for short months
    const dayOfMonth = anchor.getDate();
    const daysInMonth = getDaysInMonth(year, month);
    const day = Math.min(dayOfMonth, daysInMonth);
    const date = new Date(year, month, day);
    const dateStr = formatDate(date);
    if (isInRange(dateStr, event.date, rule.endDate)) {
      results.push({ eventId: event.id, date: dateStr, event });
    }
  }

  return results;
}

function expandYearly(event: CalendarEvent, year: number, month: number): ResolvedEvent[] {
  const anchor = parseDate(event.date);
  const rule = event.recurrence!;
  const interval = rule.interval ?? 1;

  if (month !== anchor.getMonth()) return [];

  const yearDiff = year - anchor.getFullYear();
  if (yearDiff < 0 || yearDiff % interval !== 0) return [];

  const daysInMonth = getDaysInMonth(year, month);
  const day = Math.min(anchor.getDate(), daysInMonth);
  const dateStr = formatDate(new Date(year, month, day));

  if (isInRange(dateStr, event.date, rule.endDate)) {
    return [{ eventId: event.id, date: dateStr, event }];
  }
  return [];
}

export function getEventsForMonth(
  events: CalendarEvent[],
  year: number,
  month: number
): ResolvedEvent[] {
  const results: ResolvedEvent[] = [];

  for (const event of events) {
    if (!event.recurrence) {
      results.push(...expandOneTime(event, year, month));
    } else {
      switch (event.recurrence.frequency) {
        case 'weekly':
          results.push(...expandWeekly(event, year, month));
          break;
        case 'monthly':
          results.push(...expandMonthly(event, year, month));
          break;
        case 'yearly':
          results.push(...expandYearly(event, year, month));
          break;
      }
    }
  }

  results.sort((a, b) => a.date.localeCompare(b.date));
  return results;
}

export function getUpcomingEvents(
  events: CalendarEvent[],
  count: number
): ResolvedEvent[] {
  const today = new Date();
  const todayStr = formatDate(today);
  const results: ResolvedEvent[] = [];

  for (let i = 0; i < 4 && results.length < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthEvents = getEventsForMonth(events, d.getFullYear(), d.getMonth());
    for (const ev of monthEvents) {
      if (ev.date >= todayStr && results.length < count) {
        // Avoid duplicates
        if (!results.some((r) => r.eventId === ev.eventId && r.date === ev.date)) {
          results.push(ev);
        }
      }
    }
  }

  return results.slice(0, count);
}
