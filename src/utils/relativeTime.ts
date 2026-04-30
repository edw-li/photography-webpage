const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function formatRelativeTime(input: string | Date): string {
  const t = typeof input === 'string' ? new Date(input) : input;
  const ts = t.getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  // Future timestamps (clock skew between client and server) read as "just now"
  // rather than displaying a misleading negative duration.
  if (diff < 30 * SECOND) return 'just now';
  if (diff < MINUTE) return `${Math.floor(diff / SECOND)}s ago`;
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins}m ago`;
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return `${hours}h ago`;
  }
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days}d ago`;
  }
  // Beyond a week, show absolute date (locale-friendly)
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: t.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
