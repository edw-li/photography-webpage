import { useEffect, useRef, useState } from 'react';
import type { ResolvedEvent } from '../types/events';
import { X } from 'lucide-react';
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
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const startClose = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setIsClosing(true);
    }
  };

  // Focus close button on open
  useEffect(() => {
    if (resolvedEvent) closeRef.current?.focus();
  }, [resolvedEvent]);

  // Body scroll lock
  useEffect(() => {
    if (!resolvedEvent) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [resolvedEvent]);

  // Keyboard: Escape
  useEffect(() => {
    if (!resolvedEvent) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [resolvedEvent, onClose]);

  // Focus trap
  useEffect(() => {
    if (!resolvedEvent) return;
    const backdrop = modalRef.current;
    if (!backdrop) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = backdrop.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"]), a[href], input, textarea, select'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [resolvedEvent]);

  if (!resolvedEvent) return null;

  const { event, date } = resolvedEvent;
  const d = parseDate(date);
  const monthStr = MONTH_ABBR[d.getMonth()];
  const dayStr = String(d.getDate());

  const timeStr = formatTime(event.time);
  const endTimeStr = event.endTime ? formatTime(event.endTime) : null;

  return (
    <div
      className={`events__modal-backdrop${isClosing ? ' events__modal-backdrop--closing' : ''}`}
      onClick={startClose}
      onAnimationEnd={() => { if (isClosing) { setIsClosing(false); onClose(); } }}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={event.title}
    >
      <div className="events__modal" onClick={(e) => e.stopPropagation()}>
        <button className="events__modal-close" onClick={startClose} aria-label="Close" ref={closeRef}>
          <X size={24} />
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
