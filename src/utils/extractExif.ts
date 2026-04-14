import exifr from 'exifr';

export interface ExtractedExif {
  camera: string;
  focalLength: string;
  aperture: string;
  shutterSpeed: string;
  iso: string;
}

const EMPTY: ExtractedExif = {
  camera: '',
  focalLength: '',
  aperture: '',
  shutterSpeed: '',
  iso: '',
};

function formatCamera(make?: string, model?: string): string {
  if (!model && !make) return '';
  if (!model) return (make ?? '').trim();
  if (!make) return model.trim();

  const m = make.trim();
  const mod = model.trim();

  // Many cameras repeat the make inside the model string
  if (mod.toLowerCase().startsWith(m.toLowerCase())) {
    return mod;
  }
  return `${m} ${mod}`;
}

function formatShutterSpeed(exposure?: number): string {
  if (exposure == null || exposure <= 0) return '';
  if (exposure >= 1) return `${exposure}s`;
  const denom = Math.round(1 / exposure);
  return `1/${denom}s`;
}

export async function extractExif(file: File): Promise<ExtractedExif> {
  try {
    const data = await exifr.parse(file, [
      'Make',
      'Model',
      'FocalLength',
      'FocalLengthIn35mmFormat',
      'FNumber',
      'ExposureTime',
      'ISO',
    ]);

    if (!data) return EMPTY;

    const focalValue = data.FocalLengthIn35mmFormat ?? data.FocalLength;

    return {
      camera: formatCamera(data.Make, data.Model),
      focalLength: focalValue != null ? `${Math.round(focalValue)}mm` : '',
      aperture: data.FNumber != null ? `f/${data.FNumber}` : '',
      shutterSpeed: formatShutterSpeed(data.ExposureTime),
      iso: data.ISO != null ? String(data.ISO) : '',
    };
  } catch {
    return EMPTY;
  }
}
