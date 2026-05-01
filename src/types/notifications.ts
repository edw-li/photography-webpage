export type NotificationType =
  | 'gallery_like'
  | 'gallery_comment'
  | 'gallery_reply'
  | 'gallery_mention'
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

export interface GalleryReplyPayload {
  photoId: number;
  photoTitle: string;
  photoUrl: string;
  commentId: number;
  parentCommentId: number;
  bodyPreview: string;
  actorUserId: string;
  actorName: string;
}

export interface GalleryMentionPayload {
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
  | GalleryReplyPayload
  | GalleryMentionPayload
  | ContestNotificationPayload;

export interface AppNotification {
  id: number;
  type: NotificationType;
  payload: NotificationPayload;
  isRead: boolean;
  createdAt: string;
}
