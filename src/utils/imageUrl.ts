export type ImageSize = 'thumb' | 'medium' | 'full' | 'original';

export function getImageUrl(baseUrl: string, size: ImageSize = 'original'): string {
  if (size === 'original' || !baseUrl.includes('/uploads/')) return baseUrl;
  const lastDot = baseUrl.lastIndexOf('.');
  if (lastDot === -1) return baseUrl;
  return `${baseUrl.substring(0, lastDot)}_${size}${baseUrl.substring(lastDot)}`;
}
