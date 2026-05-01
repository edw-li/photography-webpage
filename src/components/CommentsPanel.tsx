import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getPhotoComments, postPhotoComment } from '../api/gallery';
import CommentItem from './CommentItem';
import MentionAutocomplete from './MentionAutocomplete';
import { buildBodyForSubmit } from '../utils/parseMentions';
import type { GalleryComment } from '../types/comments';
import './CommentsPanel.css';

const MAX_BODY = 1000;
const PAGE_SIZE = 20;

interface CommentTreeNode {
  comment: GalleryComment;
  replies: GalleryComment[];
}

function buildCommentTree(items: GalleryComment[]): CommentTreeNode[] {
  const repliesByParent = new Map<number, GalleryComment[]>();
  for (const c of items) {
    if (c.parentId == null) continue;
    const arr = repliesByParent.get(c.parentId) ?? [];
    arr.push(c);
    repliesByParent.set(c.parentId, arr);
  }
  // Tops appear in newest-first order from the API; replies sorted oldest-first
  // so threads read top-down chronologically.
  return items
    .filter((c) => c.parentId == null)
    .map((top) => ({
      comment: top,
      replies: (repliesByParent.get(top.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    }));
}

interface ReplyFormProps {
  photoId: number;
  parentId: number;
  onCancel: () => void;
  onPosted: (reply: GalleryComment) => void;
}

function ReplyForm({ photoId, parentId, onCancel, onPosted }: ReplyFormProps) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const mentionsRef = useRef<Map<string, number>>(new Map());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const tokenized = buildBodyForSubmit(trimmed, mentionsRef.current);
      const created = await postPhotoComment(photoId, tokenized, parentId);
      onPosted(created);
    } catch {
      addToast('error', 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const onCmdEnter = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit(e as unknown as FormEvent);
    }
  };

  const counter = `${draft.length}/${MAX_BODY}`;

  return (
    <form className="comments-panel__reply-form" onSubmit={submit}>
      <div className="comments-panel__composer">
        <textarea
          ref={textareaRef}
          className="comments-panel__input"
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value.slice(0, MAX_BODY));
            setCursor(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => {
            setCursor(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={onCmdEnter}
          placeholder="Write a reply… use @ to mention"
          maxLength={MAX_BODY}
          rows={2}
          disabled={submitting}
        />
        <MentionAutocomplete
          value={draft}
          cursor={cursor}
          anchorRef={textareaRef}
          onInsert={(newValue, newCursor, mention) => {
            mentionsRef.current.set(mention.name, mention.memberId);
            setDraft(newValue);
            setCursor(newCursor);
            requestAnimationFrame(() => {
              const el = textareaRef.current;
              if (!el) return;
              el.focus();
              el.setSelectionRange(newCursor, newCursor);
            });
          }}
        />
      </div>
      <div className="comments-panel__form-row">
        <span
          className={`comments-panel__counter${
            draft.length > MAX_BODY * 0.9 ? ' comments-panel__counter--warn' : ''
          }`}
          aria-live="polite"
        >
          {counter}
        </span>
        <button
          type="button"
          className="comments-panel__cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="comments-panel__submit"
          disabled={submitting || !draft.trim()}
        >
          {submitting ? 'Posting…' : 'Reply'}
        </button>
      </div>
    </form>
  );
}

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
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const mentionsRef = useRef<Map<string, number>>(new Map());

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
    setReplyingTo(null);
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
      const tokenized = buildBodyForSubmit(trimmed, mentionsRef.current);
      const created = await postPhotoComment(photoId, tokenized);
      setComments((prev) => [created, ...prev]);
      setTotal((t) => {
        const next = t + 1;
        onCountChangeRef.current?.(next);
        return next;
      });
      setDraft('');
      mentionsRef.current.clear();
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
            {buildCommentTree(comments).map((node) => (
              <div key={node.comment.id} className="comments-panel__thread">
                <CommentItem
                  comment={node.comment}
                  isAdmin={isAdmin}
                  canReply={isAuthenticated}
                  onReplyClick={() =>
                    setReplyingTo((curr) => (curr === node.comment.id ? null : node.comment.id))
                  }
                  onUpdated={(updated) =>
                    setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
                  }
                  onDeleted={(id) => {
                    // The DB cascades replies on parent delete — mirror locally.
                    const removedCount = 1 + comments.filter((x) => x.parentId === id).length;
                    setComments((prev) => prev.filter((x) => x.id !== id && x.parentId !== id));
                    setTotal((t) => {
                      const next = Math.max(0, t - removedCount);
                      onCountChangeRef.current?.(next);
                      return next;
                    });
                    if (replyingTo === id) setReplyingTo(null);
                  }}
                />
                {node.replies.length > 0 && (
                  <div className="comments-panel__replies">
                    {node.replies.map((r) => (
                      <CommentItem
                        key={r.id}
                        comment={r}
                        isAdmin={isAdmin}
                        canReply={false}
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
                  </div>
                )}
                {replyingTo === node.comment.id && (
                  <ReplyForm
                    photoId={photoId}
                    parentId={node.comment.id}
                    onCancel={() => setReplyingTo(null)}
                    onPosted={(reply) => {
                      setComments((prev) => [...prev, reply]);
                      setTotal((t) => {
                        const next = t + 1;
                        onCountChangeRef.current?.(next);
                        return next;
                      });
                      setReplyingTo(null);
                    }}
                  />
                )}
              </div>
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
        <div className="comments-panel__composer">
          <textarea
            ref={textareaRef}
            className="comments-panel__input"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, MAX_BODY));
              setCursor(e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => {
              setCursor(e.currentTarget.selectionStart ?? 0);
            }}
            onKeyDown={onCmdEnter}
            placeholder={isAuthenticated ? 'Share your thoughts… use @ to mention' : 'Log in to comment'}
            maxLength={MAX_BODY}
            rows={2}
            disabled={!isAuthenticated || submitting}
          />
          {isAuthenticated && (
            <MentionAutocomplete
              value={draft}
              cursor={cursor}
              anchorRef={textareaRef}
              onInsert={(newValue, newCursor, mention) => {
                mentionsRef.current.set(mention.name, mention.memberId);
                setDraft(newValue);
                setCursor(newCursor);
                requestAnimationFrame(() => {
                  const el = textareaRef.current;
                  if (!el) return;
                  el.focus();
                  el.setSelectionRange(newCursor, newCursor);
                });
              }}
            />
          )}
        </div>
        <div className="comments-panel__form-row">
          <span
            className={`comments-panel__counter${
              draft.length > MAX_BODY * 0.9 ? ' comments-panel__counter--warn' : ''
            }`}
            aria-live="polite"
          >
            {counter}
          </span>
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
