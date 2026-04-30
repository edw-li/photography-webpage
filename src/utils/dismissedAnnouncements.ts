const KEY = 'dismissed_announcements';
const MAX = 50;

function readList(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

function writeList(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled — non-fatal; banner will reappear next visit.
  }
}

export function isLocallyDismissed(id: string): boolean {
  return readList().includes(id);
}

export function addLocalDismissal(id: string): void {
  const list = readList().filter((x) => x !== id);
  list.push(id);
  while (list.length > MAX) list.shift();
  writeList(list);
}
