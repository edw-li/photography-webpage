import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getPhotoComments, postPhotoComment } from '../api/gallery';
import CommentItem from './CommentItem';
import type { GalleryComment } from '../types/comments';
import './CommentsPanel.css';

const MAX_BODY = 1000;
const PAGE_SIZE = 20;

interface CommentsPanelProps {
  photoId: number;
  initialCount?: number;
  onCountChange?: (count: number) => void;
}

export default function CommentsPanel({ photoId, initialCount, onCountChange }: CommentsPanelProps) {
  const { isAuthenticated, isAdmin } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [comments, setComments] = useState<GalleryComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(initialCount ?? 0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);

  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Hold latest onCountChange in a ref so it doesn't drive useCallback identity
  // (parent passes an inline arrow that re-creates each render — without the
  // ref this caused loadPage to re-create, retriggering the load effect, which
  // called onCountChange, which re-rendered the parent — an infinite loop).
  const onCountChangeRef = useRef(onCountChange);
  useEffect(() => { onCountChangeRef.current = onCountChange; });

  const loadPage = useCallback(
    async (p: number, replace: boolean) => {
      try {
        const data = await getPhotoComments(photoId, p, PAGE_SIZE);
        setTotal(data.total);
        setPages(data.pages);
        setComments((prev) => (replace ? data.items : [...prev, ...data.items]));
        onCountChangeRef.current?.(data.total);
      } catch {
        addToast('error', 'Failed to load comments');
      }
    },
    [photoId, addToast],
  );

  // Reset and load when photoId changes
  useEffect(() => {
    setLoading(true);
    setPage(1);
    setComments([]);
    loadPage(1, true).finally(() => setLoading(false));
  }, [photoId, loadPage]);

  const loadMore = async () => {
    if (page >= pages) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await loadPage(nextPage, false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      addToast('info', 'Log in to leave a comment');
      navigate('/login');
      return;
    }
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const created = await postPhotoComment(photoId, trimmed);
      setComments((prev) => [created, ...prev]);
      setTotal((t) => {
        const next = t + 1;
        onCountChangeRef.current?.(next);
        return next;
      });
      setDraft('');
    } catch {
      addToast('error', 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const onCmdEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleSubmit(e as unknown as FormEvent);
    }
  };

  const counter = `${draft.length}/${MAX_BODY}`;

  return (
    <div className="comments-panel">
      <div className="comments-panel__header">
        <MessageCircle size={16} />
        <span className="comments-panel__title">Comments</span>
        <span className="comments-panel__count">{total}</span>
      </div>
      <div className="comments-panel__list" role="list">
        {loading ? (
          <div className="comments-panel__loading">
            <Loader2 size={18} className="comments-panel__spinner" />
          </div>
        ) : comments.length === 0 ? (
          <div className="comments-panel__empty">
            No comments yet. Be the first to share your thoughts.
          </div>
        ) : (
          <>
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                isAdmin={isAdmin}
                onUpdated={(updated) =>
                  setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                }
                onDeleted={(id) => {
                  setComments((prev) => prev.filter((x) => x.id !== id));
                  setTotal((t) => {
                    const next = Math.max(0, t - 1);
                    onCountChangeRef.current?.(next);
                    return next;
                  });
                }}
              />
            ))}
            {page < pages && (
              <button
                type="button"
                className="comments-panel__load-more"
                onClick={loadMore}
              >
                Load more comments
              </button>
            )}
          </>
        )}
      </div>
      <form className="comments-panel__form" onSubmit={handleSubmit}>
        <textarea
          className="comments-panel__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={onCmdEnter}
          placeholder={isAuthenticated ? 'Share your thoughts…' : 'Log in to comment'}
          maxLength={MAX_BODY}
          rows={2}
          disabled={!isAuthenticated || submitting}
        />
        <div className="comments-panel__form-row">
          {draft.length > MAX_BODY * 0.8 && (
            <span className="comments-panel__counter">{counter}</span>
          )}
          <button
            type="submit"
            className="comments-panel__submit"
            disabled={!isAuthenticated || submitting || !draft.trim()}
          >
            {submitting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </form>
    </div>
  );
}
