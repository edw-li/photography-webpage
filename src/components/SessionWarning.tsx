import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import './SessionWarning.css';

interface SessionWarningProps {
  remainingSeconds: number;
  onExtend: () => void;
  onLogout: () => void;
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SessionWarning({
  remainingSeconds,
  onExtend,
  onLogout,
}: SessionWarningProps) {
  const extendRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    extendRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="session-warning-overlay">
      <div
        className="session-warning"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="session-warning__title">
          <Clock size={18} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
          Session Expiring
        </h3>
        <p className="session-warning__message">
          Your session will expire due to inactivity.
        </p>
        <span className="session-warning__time">{formatTime(remainingSeconds)}</span>
        <div className="session-warning__actions">
          <button
            className="session-warning__btn session-warning__btn--logout"
            onClick={onLogout}
          >
            Log Out Now
          </button>
          <button
            ref={extendRef}
            className="session-warning__btn session-warning__btn--extend"
            onClick={onExtend}
          >
            Stay Logged In
          </button>
        </div>
      </div>
    </div>
  );
}
