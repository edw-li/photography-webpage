export interface PhotoExif {
  camera?: string;
  focalLength?: string;
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
}

export interface GalleryPhoto {
  id: number;
  url: string;
  title: string;
  photographer: string;
  exif?: PhotoExif;
}

export interface GalleryConfig {
  gallery: GalleryPhoto[];
}
