import { useEffect } from 'react';
import type { ResolvedEvent } from '../types/events';
import { parseDate, formatTime } from '../utils/recurrence';

const MONTH_ABBR = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

interface EventModalProps {
  resolvedEvent: ResolvedEvent | null;
  onClose: () => void;
}

export default function EventModal({ resolvedEvent, onClose }: EventModalProps) {
  useEffect(() => {
    if (!resolvedEvent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [resolvedEvent, onClose]);

  if (!resolvedEvent) return null;

  const { event, date } = resolvedEvent;
  const d = parseDate(date);
  const monthStr = MONTH_ABBR[d.getMonth()];
  const dayStr = String(d.getDate());

  const timeStr = formatTime(event.time);
  const endTimeStr = event.endTime ? formatTime(event.endTime) : null;

  return (
    <div className="events__modal-backdrop" onClick={onClose}>
      <div className="events__modal" onClick={(e) => e.stopPropagation()}>
        <button className="events__modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
        <div className="events__modal-header">
          <div className="events__date">
            <span className="events__month">{monthStr}</span>
            <span className="events__day">{dayStr}</span>
          </div>
          <h3>{event.title}</h3>
        </div>
        <div className="events__modal-meta">
          {event.location && (
            <p>
              <strong>Location:</strong> {event.location}
            </p>
          )}
          <p>
            <strong>Time:</strong> {timeStr}
            {endTimeStr && ` – ${endTimeStr}`}
          </p>
        </div>
        <div className="events__modal-description">
          <p>{event.description}</p>
        </div>
      </div>
    </div>
  );
}
