export type ImageSize = 'thumb' | 'medium' | 'full' | 'original';

export function getImageUrl(baseUrl: string, size: ImageSize = 'original'): string {
  if (size === 'original') return baseUrl;
  // API proxy URLs (used to anonymize contest submissions during voting) accept
  // a ?size= query parameter rather than the _<size> filename suffix.
  if (baseUrl.startsWith('/api/')) {
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}size=${size}`;
  }
  if (!baseUrl.includes('/uploads/')) return baseUrl;
  const lastDot = baseUrl.lastIndexOf('.');
  if (lastDot === -1) return baseUrl;
  return `${baseUrl.substring(0, lastDot)}_${size}${baseUrl.substring(lastDot)}`;
}
