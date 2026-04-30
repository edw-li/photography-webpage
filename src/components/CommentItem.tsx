import { useState, type FormEvent } from 'react';
import { Pencil, Trash2, X, Check } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { editPhotoComment, deletePhotoComment } from '../api/gallery';
import { formatRelativeTime } from '../utils/relativeTime';
import { getImageUrl } from '../utils/imageUrl';
import ConfirmDialog from './ConfirmDialog';
import type { GalleryComment } from '../types/comments';

const MAX_BODY = 1000;

interface CommentItemProps {
  comment: GalleryComment;
  isAdmin: boolean;
  onUpdated: (next: GalleryComment) => void;
  onDeleted: (id: number) => void;
}

export default function CommentItem({ comment, isAdmin, onUpdated, onDeleted }: CommentItemProps) {
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canEdit = comment.isOwn;
  const canDelete = comment.isOwn || isAdmin;

  const startEdit = () => {
    setDraft(comment.body);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(comment.body);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || trimmed === comment.body || saving) return;
    setSaving(true);
    try {
      const updated = await editPhotoComment(comment.id, trimmed);
      onUpdated(updated);
      setEditing(false);
    } catch {
      addToast('error', 'Failed to update comment');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePhotoComment(comment.id);
      onDeleted(comment.id);
      setConfirmingDelete(false);
    } catch {
      addToast('error', 'Failed to delete comment');
      setDeleting(false);
    }
  };

  const displayName = comment.authorName ?? '[deleted user]';
  const initial = (comment.authorName ?? '?').charAt(0).toUpperCase();

  return (
    <>
      <div className="comment-item">
        <div className="comment-item__avatar">
          {comment.authorAvatar ? (
            <img src={getImageUrl(comment.authorAvatar, 'thumb')} alt="" />
          ) : (
            <span aria-hidden="true">{initial}</span>
          )}
        </div>
        <div className="comment-item__main">
          <div className="comment-item__header">
            <span className="comment-item__author">{displayName}</span>
            <span className="comment-item__time">
              {formatRelativeTime(comment.createdAt)}
              {comment.edited && ' · edited'}
            </span>
          </div>
          {editing ? (
            <form className="comment-item__edit" onSubmit={handleSave}>
              <textarea
                className="comment-item__edit-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={MAX_BODY}
                rows={3}
                autoFocus
              />
              <div className="comment-item__edit-actions">
                <button
                  type="button"
                  className="comment-item__icon-btn"
                  onClick={cancelEdit}
                  aria-label="Cancel edit"
                  disabled={saving}
                >
                  <X size={14} />
                </button>
                <button
                  type="submit"
                  className="comment-item__icon-btn comment-item__icon-btn--primary"
                  aria-label="Save edit"
                  disabled={saving || !draft.trim() || draft.trim() === comment.body}
                >
                  <Check size={14} />
                </button>
              </div>
            </form>
          ) : (
            <p className="comment-item__body">{comment.body}</p>
          )}
          {!editing && (canEdit || canDelete) && (
            <div className="comment-item__actions">
              {canEdit && (
                <button
                  type="button"
                  className="comment-item__action"
                  onClick={startEdit}
                  aria-label="Edit comment"
                >
                  <Pencil size={12} /> Edit
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  className="comment-item__action comment-item__action--danger"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete comment"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete comment?"
          message="This comment will be permanently removed."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  );
}
