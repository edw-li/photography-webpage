import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { CalendarEvent, ResolvedEvent } from '../types/events';
import { getEventsForMonth, getUpcomingEvents, parseDate, formatTime } from '../utils/recurrence';
import { getEvents } from '../api/events';
import Calendar from './Calendar';
import EventModal from './EventModal';
import './Events.css';

const MONTH_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

function ClampedDescription({ description }: { description: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const p = pRef.current;
    if (!container || !p) return;

    const update = () => {
      const style = getComputedStyle(p);
      const lineHeight = parseFloat(style.lineHeight);
      const maxLines = Math.max(1, Math.floor(container.clientHeight / lineHeight));
      p.style.webkitLineClamp = String(maxLines);
    };

    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="events__card-back" ref={containerRef}>
      <p ref={pRef}>{description}</p>
    </div>
  );
}

export default function Events() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedEvent, setSelectedEvent] = useState<ResolvedEvent | null>(null);
  const [calAnimPhase, setCalAnimPhase] = useState<'exit' | 'enter' | null>(null);
  const pendingNavRef = useRef<{ month: number; year: number } | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    getEvents()
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resolvedEvents = useMemo(
    () => getEventsForMonth(events, currentYear, currentMonth),
    [events, currentYear, currentMonth]
  );

  const upcomingEvents = useMemo(
    () => getUpcomingEvents(events, 3),
    [events]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ResolvedEvent[]>();
    for (const ev of resolvedEvents) {
      const list = map.get(ev.date) ?? [];
      list.push(ev);
      map.set(ev.date, list);
    }
    return map;
  }, [resolvedEvents]);

  const handlePrevMonth = useCallback(() => {
    if (calAnimPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCurrentMonth((m) => {
        if (m === 0) { setCurrentYear((y) => y - 1); return 11; }
        return m - 1;
      });
      return;
    }
    const newMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const newYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    pendingNavRef.current = { month: newMonth, year: newYear };
    setCalAnimPhase('exit');
  }, [calAnimPhase, currentMonth, currentYear]);

  const handleNextMonth = useCallback(() => {
    if (calAnimPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCurrentMonth((m) => {
        if (m === 11) { setCurrentYear((y) => y + 1); return 0; }
        return m + 1;
      });
      return;
    }
    const newMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const newYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    pendingNavRef.current = { month: newMonth, year: newYear };
    setCalAnimPhase('exit');
  }, [calAnimPhase, currentMonth, currentYear]);

  const handleToday = useCallback(() => {
    const now = new Date();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();
    if (todayMonth === currentMonth && todayYear === currentYear) return;
    if (calAnimPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setCurrentMonth(todayMonth);
      setCurrentYear(todayYear);
      return;
    }
    pendingNavRef.current = { month: todayMonth, year: todayYear };
    setCalAnimPhase('exit');
  }, [calAnimPhase, currentMonth, currentYear]);

  const onCalAnimEnd = useCallback(() => {
    if (calAnimPhase === 'exit' && pendingNavRef.current) {
      setCurrentMonth(pendingNavRef.current.month);
      setCurrentYear(pendingNavRef.current.year);
      pendingNavRef.current = null;
      setCalAnimPhase('enter');
    } else if (calAnimPhase === 'enter') {
      setCalAnimPhase(null);
    }
  }, [calAnimPhase]);

  const handleCloseModal = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  return (
    <section id="events" className="events section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Upcoming Events</h2>
          <p>Join us at our next gathering and connect with fellow photographers</p>
        </div>

        {loading && (
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        )}

        {error && (
          <div className="section-error">
            <p>Something went wrong loading events.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="events__layout fade-in-up">
            {upcomingEvents.length > 0 && (
              <aside className="events__sidebar">
                <div className="events__grid">
                  {upcomingEvents.map((resolved) => {
                    const d = parseDate(resolved.date);
                    const monthStr = MONTH_ABBR[d.getMonth()];
                    const dayStr = String(d.getDate());
                    return (
                      <div
                        className="events__card events__card--clickable"
                        key={`${resolved.eventId}-${resolved.date}`}
                        onClick={() => setSelectedEvent(resolved)}
                      >
                        <div className="events__date">
                          <span className="events__month">{monthStr}</span>
                          <span className="events__day">{dayStr}</span>
                        </div>
                        <div className="events__info">
                          <div className="events__card-front">
                            <h3>{resolved.event.title}</h3>
                            <p className="events__card-meta">
                              {formatTime(resolved.event.time)}
                              {resolved.event.location && ` · ${resolved.event.location}`}
                            </p>
                          </div>
                          <ClampedDescription description={resolved.event.description} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </aside>
            )}
            <div className="events__calendar-wrap">
              <Calendar
                year={currentYear}
                month={currentMonth}
                eventsByDate={eventsByDate}
                onEventClick={setSelectedEvent}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                onToday={handleToday}
                calAnimPhase={calAnimPhase}
                onCalAnimEnd={onCalAnimEnd}
              />
            </div>
          </div>
        )}

        <EventModal resolvedEvent={selectedEvent} onClose={handleCloseModal} />
      </div>
    </section>
  );
}
