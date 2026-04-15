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
  visible?: boolean;
  contestId?: number | null;
  contestSubmissionId?: number | null;
  isWinner?: boolean;
  winnerPlace?: number | null;
  winnerCategory?: string | null;
  winnerPlacements?: { place: number; category: string; month?: string }[] | null;
}

export interface GalleryConfig {
  gallery: GalleryPhoto[];
}
