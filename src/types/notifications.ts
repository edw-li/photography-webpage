export type NotificationType =
  | 'gallery_like'
  | 'gallery_comment'
  | 'contest_voting_open'
  | 'contest_completed';

export interface GalleryLikePayload {
  photoId: number;
  photoTitle: string;
  photoUrl: string;
  actorUserId: string;
  actorName: string;
}

export interface GalleryCommentPayload {
  photoId: number;
  photoTitle: string;
  photoUrl: string;
  commentId: number;
  bodyPreview: string;
  actorUserId: string;
  actorName: string;
}

export interface ContestNotificationPayload {
  contestId: number;
  contestTheme: string;
  contestMonth: string;
}

export type NotificationPayload =
  | GalleryLikePayload
  | GalleryCommentPayload
  | ContestNotificationPayload;

export interface AppNotification {
  id: number;
  type: NotificationType;
  payload: NotificationPayload;
  isRead: boolean;
  createdAt: string;
}
