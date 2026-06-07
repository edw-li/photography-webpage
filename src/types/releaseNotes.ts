export interface ReleaseNote {
  id: number;
  version: string;
  date: string;
  html: string;
  bodyMd: string;
  isPublished: boolean;
}
