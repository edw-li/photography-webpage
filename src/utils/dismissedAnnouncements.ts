/**
 * Per-device dismissal tracker. Each entry records WHEN the user dismissed
 * an announcement so the banner component can compare against the server's
 * `dismissalsResetAt` timestamp. If the admin resets dismissals AFTER the
 * user's dismissal time, the local entry is stale and the banner reappears.
 */

const KEY = 'dismissed_announcements';
const MAX = 50;

export interface LocalDismissal {
  id: string;
  at: string; // ISO timestamp of dismissal
}

function readList(): LocalDismissal[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate corrupt or legacy bare-string entries by filtering them out.
    return parsed.filter(
      (x): x is LocalDismissal =>
        x !== null &&
        typeof x === 'object' &&
        typeof x.id === 'string' &&
        typeof x.at === 'string',
    );
  } catch {
    return [];
  }
}

function writeList(list: LocalDismissal[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled — non-fatal; banner will reappear next visit.
  }
}

/**
 * Returns the dismissal timestamp for the given announcement, or null if the
 * user hasn't dismissed it on this device.
 */
export function getLocalDismissal(id: string): LocalDismissal | null {
  return readList().find((x) => x.id === id) ?? null;
}

export function addLocalDismissal(id: string): void {
  const list = readList().filter((x) => x.id !== id);
  list.push({ id, at: new Date().toISOString() });
  while (list.length > MAX) list.shift();
  writeList(list);
}

/**
 * Remove a single stale entry (e.g., after detecting that the server's
 * dismissals_reset_at supersedes a local dismissal time).
 */
export function removeLocalDismissal(id: string): void {
  const list = readList().filter((x) => x.id !== id);
  writeList(list);
}
