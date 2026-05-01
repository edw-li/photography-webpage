export interface GalleryComment {
  id: number;
  photoId: number;
  parentId: number | null;
  userId: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  edited: boolean;
  isOwn: boolean;
}
