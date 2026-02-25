import { useState } from 'react';
import type { ResolvedEvent } from '../types/events';
import { getDaysInMonth, getFirstDayOfMonth, formatDate, formatTime } from '../utils/recurrence';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface CalendarProps {
  year: number;
  month: number;
  eventsByDate: Map<string, ResolvedEvent[]>;
  onEventClick: (event: ResolvedEvent) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

export default function Calendar({
  year,
  month,
  eventsByDate,
  onEventClick,
  onPrevMonth,
  onNextMonth,
  onToday,
}: CalendarProps) {
  const [popoverDay, setPopoverDay] = useState<string | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = formatDate(new Date());

  const handleDayClick = (dateStr: string) => {
    const dayEvents = eventsByDate.get(dateStr);
    if (!dayEvents || dayEvents.length === 0) return;
    if (dayEvents.length === 1) {
      onEventClick(dayEvents[0]);
      setPopoverDay(null);
    } else {
      setPopoverDay(popoverDay === dateStr ? null : dateStr);
    }
  };

  const handlePopoverEventClick = (ev: ResolvedEvent) => {
    onEventClick(ev);
    setPopoverDay(null);
  };

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div className="events__calendar">
      <div className="events__calendar-header">
        <div className="events__calendar-nav-group">
          <button
            className="events__calendar-nav"
            onClick={onPrevMonth}
            aria-label="Previous month"
          >
            &#8249;
          </button>
          <h3>
            {MONTH_NAMES[month]} {year}
          </h3>
          <button
            className="events__calendar-nav"
            onClick={onNextMonth}
            aria-label="Next month"
          >
            &#8250;
          </button>
        </div>
        <button
          className="events__calendar-today-btn"
          onClick={onToday}
        >
          Today
        </button>
      </div>
      <div className="events__calendar-weekdays">
        {WEEKDAYS.map((d) => (
          <div key={d} className="events__calendar-weekday">
            {d}
          </div>
        ))}
      </div>
      <div className="events__calendar-days">
        {days.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="events__day-cell events__day-cell--empty" />;
          }
          const dateStr = formatDate(new Date(year, month, day));
          const dayEvents = eventsByDate.get(dateStr) ?? [];
          const isToday = dateStr === todayStr;
          const hasEvents = dayEvents.length > 0;

          return (
            <div
              key={dateStr}
              className={`events__day-cell${hasEvents ? ' events__day-cell--has-events' : ''}`}
              onClick={() => handleDayClick(dateStr)}
            >
              <span
                className={`events__day-number${isToday ? ' events__day-number--today' : ''}`}
              >
                {day}
              </span>
              {hasEvents && (
                <>
                  <div className="events__day-dots">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <span key={ev.eventId} className="events__day-dot" />
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="events__day-dot-more">+{dayEvents.length - 3}</span>
                    )}
                  </div>
                  {dayEvents.slice(0, 2).map((ev) => (
                    <div key={ev.eventId} className="events__day-event-label">
                      {ev.event.title}
                    </div>
                  ))}
                </>
              )}
              {popoverDay === dateStr && dayEvents.length > 1 && (
                <div className="events__day-popover">
                  {dayEvents.map((ev) => (
                    <button
                      key={ev.eventId}
                      className="events__day-popover-item"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePopoverEventClick(ev);
                      }}
                    >
                      <span className="events__day-dot" />
                      <span>{formatTime(ev.event.time)} — {ev.event.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
