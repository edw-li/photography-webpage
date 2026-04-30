import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, Loader2, CheckCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type ListNotificationsOptions,
} from '../api/notifications';
import useUnreadCount from '../hooks/useUnreadCount';
import { useScrollReveal } from '../hooks/useScrollReveal';
import NotificationItem from '../components/NotificationItem';
import type { AppNotification, NotificationType } from '../types/notifications';
import './NotificationsPage.css';

type Filter = 'all' | 'unread' | 'likes' | 'comments' | 'contests';

const TYPE_FILTER: Record<Exclude<Filter, 'all' | 'unread'>, NotificationType[]> = {
  likes: ['gallery_like'],
  comments: ['gallery_comment'],
  contests: ['contest_voting_open', 'contest_completed'],
};

const PAGE_SIZE = 20;

function filterToListOptions(filter: Filter): ListNotificationsOptions {
  if (filter === 'all') return {};
  if (filter === 'unread') return { unreadOnly: true };
  return { types: TYPE_FILTER[filter] };
}

export default function NotificationsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  useScrollReveal();
  // Live global unread count (synced via UNREAD_COUNT_EVENT) — used for the
  // "unread" tab badge so it stays accurate beyond the loaded page.
  const { count: liveUnreadCount } = useUnreadCount();

  const [items, setItems] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);

  // Redirect unauthenticated users
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Reload from server whenever the filter changes (or on initial mount).
  // Items already in the list (e.g., unread ones the user just marked as read
  // by viewing) stay visible until the user changes filter or reloads — so
  // the "unread" tab won't make items vanish under the cursor.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    setLoading(true);
    listNotifications(1, PAGE_SIZE, filterToListOptions(filter))
      .then((data) => {
        if (cancelled) return;
        setItems(data.items);
        setPages(data.pages);
        setPage(1);
      })
      .catch(() => {
        if (cancelled) return;
        addToast('error', 'Failed to load notifications');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, filter, addToast]);

  const loadMore = async () => {
    if (page >= pages || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const data = await listNotifications(next, PAGE_SIZE, filterToListOptions(filter));
      setItems((prev) => [...prev, ...data.items]);
      setPage(next);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleMarkRead = useCallback(async (id: number) => {
    let alreadyRead = false;
    setItems((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target?.isRead) {
        alreadyRead = true;
        return prev;
      }
      return prev.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    });
    if (alreadyRead) return;
    try {
      await markNotificationRead(id);
    } catch {
      // Silent — UI already updated; user will see actual state on next load
    }
  }, []);

  const handleMarkAllRead = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      addToast('success', 'All notifications marked as read');
    } catch {
      addToast('error', 'Failed to mark all as read');
    } finally {
      setBusy(false);
    }
  };

  // The list is already filtered server-side, so render `items` directly.
  const filtered = items;

  // Used to decide whether to show "Mark all as read" — derived from the loaded
  // page; combined with liveUnreadCount for the unread tab badge below.
  const unreadInLoaded = useMemo(
    () => items.filter((n) => !n.isRead).length,
    [items],
  );
  const showMarkAll = liveUnreadCount > 0 || unreadInLoaded > 0;

  if (authLoading) {
    return (
      <main className="notif-page">
        <div className="notif-page__loading">
          <Loader2 size={20} className="notif-page__spinner" />
        </div>
      </main>
    );
  }

  return (
    <main className="notif-page">
      <section className="notif-page__hero">
        <div className="notif-page__hero-content fade-in-up">
          <h1>Notifications</h1>
          <p>Activity across the photography club.</p>
        </div>
      </section>

      <div className="notif-page__container">
        <div className="notif-page__toolbar fade-in-up delay-1">
          <div className="notif-page__tabs" role="tablist">
            {(['all', 'unread', 'likes', 'comments', 'contests'] as Filter[]).map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={filter === f}
                className={`notif-page__tab${filter === f ? ' notif-page__tab--active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'unread' && liveUnreadCount > 0 && (
                  <span className="notif-page__tab-count">{liveUnreadCount}</span>
                )}
              </button>
            ))}
          </div>
          {showMarkAll && (
            <button
              type="button"
              className="notif-page__mark-all"
              onClick={handleMarkAllRead}
              disabled={busy}
            >
              <CheckCheck size={14} /> Mark all as read
            </button>
          )}
        </div>

        <div className="notif-page__list fade-in-up delay-2">
          {loading ? (
            <div className="notif-page__loading">
              <Loader2 size={20} className="notif-page__spinner" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="notif-page__empty">
              <BellOff size={32} />
              <p>
                {filter === 'unread'
                  ? "You're all caught up."
                  : filter === 'all'
                    ? 'No notifications yet. Engage with the community to get started.'
                    : `No ${filter} notifications yet.`}
              </p>
            </div>
          ) : (
            <>
              {filtered.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={handleMarkRead}
                />
              ))}
              {page < pages && (
                <button
                  type="button"
                  className="notif-page__load-more"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
