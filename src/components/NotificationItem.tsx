import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Calendar, Trophy } from 'lucide-react';
import type {
  AppNotification,
  ContestNotificationPayload,
  GalleryCommentPayload,
  GalleryLikePayload,
  GalleryMentionPayload,
  GalleryReplyPayload,
} from '../types/notifications';
import { formatRelativeTime } from '../utils/relativeTime';
import { getImageUrl } from '../utils/imageUrl';

const VISIBLE_DURATION_MS = 1500;

interface NotificationItemProps {
  notification: AppNotification;
  onMarkRead: (id: number) => void;
}

export default function NotificationItem({ notification, onMarkRead }: NotificationItemProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  // Auto-mark as read when visible for >= 1.5s
  useEffect(() => {
    if (notification.isRead) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
        if (timerRef.current === null) {
          timerRef.current = window.setTimeout(() => {
            onMarkRead(notification.id);
            timerRef.current = null;
          }, VISIBLE_DURATION_MS);
        }
      } else if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [notification.id, notification.isRead, onMarkRead]);

  const renderContent = () => {
    switch (notification.type) {
      case 'gallery_like': {
        const p = notification.payload as GalleryLikePayload;
        return {
          icon: <Heart size={18} className="notif__type-icon notif__type-icon--like" fill="currentColor" />,
          title: <><strong>{p.actorName}</strong> liked your photo</>,
          subtitle: p.photoTitle,
          thumb: p.photoUrl,
          target: `/?photo=${p.photoId}`,
        };
      }
      case 'gallery_comment': {
        const p = notification.payload as GalleryCommentPayload;
        return {
          icon: <MessageCircle size={18} className="notif__type-icon notif__type-icon--comment" />,
          title: <><strong>{p.actorName}</strong> commented on your photo</>,
          subtitle: `"${p.bodyPreview}${p.bodyPreview.length >= 140 ? '…' : ''}"`,
          thumb: p.photoUrl,
          target: `/?photo=${p.photoId}`,
        };
      }
      case 'gallery_reply': {
        const p = notification.payload as GalleryReplyPayload;
        return {
          icon: <MessageCircle size={18} className="notif__type-icon notif__type-icon--comment" />,
          title: <><strong>{p.actorName}</strong> replied to your comment</>,
          subtitle: `"${p.bodyPreview}${p.bodyPreview.length >= 140 ? '…' : ''}"`,
          thumb: p.photoUrl,
          target: `/?photo=${p.photoId}`,
        };
      }
      case 'gallery_mention': {
        const p = notification.payload as GalleryMentionPayload;
        return {
          icon: <MessageCircle size={18} className="notif__type-icon notif__type-icon--comment" />,
          title: <><strong>{p.actorName}</strong> mentioned you in a comment</>,
          subtitle: `"${p.bodyPreview}${p.bodyPreview.length >= 140 ? '…' : ''}"`,
          thumb: p.photoUrl,
          target: `/?photo=${p.photoId}`,
        };
      }
      case 'contest_voting_open': {
        const p = notification.payload as ContestNotificationPayload;
        return {
          icon: <Calendar size={18} className="notif__type-icon notif__type-icon--contest" />,
          title: <>Voting is now open: <strong>{p.contestTheme}</strong></>,
          subtitle: 'Cast your votes before the deadline.',
          thumb: null,
          target: '/contest',
        };
      }
      case 'contest_completed': {
        const p = notification.payload as ContestNotificationPayload;
        return {
          icon: <Trophy size={18} className="notif__type-icon notif__type-icon--trophy" />,
          title: <>Winners announced: <strong>{p.contestTheme}</strong></>,
          subtitle: 'See who took home the top placements.',
          thumb: null,
          target: '/my-results',
        };
      }
      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  const handleClick = () => {
    if (!notification.isRead) onMarkRead(notification.id);
    navigate(content.target);
  };

  return (
    <div
      ref={ref}
      className={`notif${notification.isRead ? '' : ' notif--unread'}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="notif__icon">{content.icon}</div>
      <div className="notif__main">
        <div className="notif__title">{content.title}</div>
        {content.subtitle && <div className="notif__subtitle">{content.subtitle}</div>}
        <div className="notif__time">{formatRelativeTime(notification.createdAt)}</div>
      </div>
      {content.thumb && (
        <img className="notif__thumb" src={getImageUrl(content.thumb, 'thumb')} alt="" />
      )}
      {!notification.isRead && <span className="notif__dot" aria-label="Unread" />}
    </div>
  );
}
