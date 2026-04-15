/** Extensions recognised as images even when the browser reports an empty MIME type (e.g. HEIC on Windows). */
const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp)$/i;

/**
 * accept string for file inputs — includes HEIC/HEIF so the OS file picker
 * shows them alongside standard image formats.
 */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/** Check whether a File looks like an image (by MIME type OR file extension). */
export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXTENSIONS.test(file.name);
}

export interface CompressResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  wasCompressed: boolean;
}

interface CompressOptions {
  maxSizeMB?: number;
  maxDimension?: number;
  initialQuality?: number;
  qualityStep?: number;
  qualityFloor?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxSizeMB: 1.5,
  maxDimension: 3840,
  initialQuality: 0.85,
  qualityStep: 0.1,
  qualityFloor: 0.4,
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      type,
      quality,
    );
  });
}

export async function compressImage(
  file: File,
  options?: CompressOptions,
): Promise<CompressResult> {
  const opts = { ...DEFAULTS, ...options };
  const maxBytes = opts.maxSizeMB * 1024 * 1024;

  // Bail for GIFs — can't preserve animation via Canvas
  if (file.type === 'image/gif') {
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  }

  // Non-web-safe formats (HEIC, HEIF, TIFF, BMP, etc.) must always be
  // converted to JPEG via canvas — the backend only accepts JPEG/PNG/GIF/WebP.
  const isWebSafe = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type);

  // Load image to check dimensions.
  // If the browser can't decode the format (e.g. HEIC on Windows without HEIF
  // extensions), return the original file and let the backend handle conversion.
  const url = URL.createObjectURL(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } catch {
    URL.revokeObjectURL(url);
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  } finally {
    URL.revokeObjectURL(url);
  }

  // Bail if already under target size, dimensions are normal, AND format is web-safe
  const needsResize =
    img.naturalWidth > opts.maxDimension || img.naturalHeight > opts.maxDimension;
  if (file.size <= maxBytes && !needsResize && isWebSafe) {
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  }

  // Calculate target dimensions
  let { naturalWidth: w, naturalHeight: h } = img;
  if (needsResize) {
    const scale = opts.maxDimension / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  // Draw to canvas
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  ctx.drawImage(img, 0, 0, w, h);

  // Choose output format: WebP for PNGs (preserves transparency), JPEG otherwise
  const outputType = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
  const ext = outputType === 'image/webp' ? '.webp' : '.jpg';

  // Iterative quality loop
  let quality = opts.initialQuality;
  let blob = await canvasToBlob(canvas, outputType, quality);

  while (blob.size > maxBytes && quality > opts.qualityFloor) {
    quality -= opts.qualityStep;
    blob = await canvasToBlob(canvas, outputType, Math.max(quality, opts.qualityFloor));
  }

  // Release canvas pixel buffer eagerly
  canvas.width = 0;
  canvas.height = 0;

  // If compression made it bigger and format is already web-safe, return original.
  // Non-web-safe formats (HEIC, etc.) must still return the converted version.
  if (blob.size >= file.size && isWebSafe) {
    return { file, originalSize: file.size, compressedSize: file.size, wasCompressed: false };
  }

  // Build a new File from the blob
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
  const compressed = new File([blob], baseName + ext, { type: outputType });

  return {
    file: compressed,
    originalSize: file.size,
    compressedSize: compressed.size,
    wasCompressed: true,
  };
}
