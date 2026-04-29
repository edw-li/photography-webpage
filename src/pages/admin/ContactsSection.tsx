import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import type { ContactItem, Paginated } from './types';
import { formatDate } from './types';
import Pagination from './Pagination';

export default function ContactsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ContactItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [viewItem, setViewItem] = useState<ContactItem | null>(null);
  const [replyTarget, setReplyTarget] = useState<ContactItem | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [initialReplyBody, setInitialReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<ContactItem>>(`/contact?page=${p}&page_size=${pageSize}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch (err) {
      addToast('error', 'Failed to load contacts');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/contact/${deleteTarget.id}`, { method: 'DELETE' });
      addToast('success', 'Contact submission deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete contact');
    }
    setDeleting(false);
  };

  const openReply = (c: ContactItem) => {
    setReplyTarget(c);
    const init = c.replyMessage || '';
    setReplyBody(init);
    setInitialReplyBody(init);
  };

  const isReplyDirty = replyBody !== initialReplyBody;

  const handleReply = async () => {
    if (!replyTarget) return;
    if (!replyBody.trim()) {
      addToast('error', 'Reply cannot be empty');
      return;
    }
    setSending(true);
    try {
      await apiFetch(`/contact/${replyTarget.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ replyBody: replyBody.trim() }),
      });
      addToast('success', `Reply sent to ${replyTarget.email}`);
      setReplyTarget(null);
      setReplyBody('');
      load(page);
    } catch {
      addToast('error', 'Failed to send reply');
    }
    setSending(false);
  };

  const filtered = search
    ? items.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.message.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  if (loading) return <p className="admin__loading">Loading contacts...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search contacts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Message</th><th>Date</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>
                  <span
                    className="admin__clickable"
                    onClick={() => setViewItem(c)}
                    title="Click to view full message"
                  >
                    {c.message.length > 80 ? c.message.slice(0, 80) + '...' : c.message}
                  </span>
                </td>
                <td>{formatDate(c.createdAt)}</td>
                <td>
                  <span className={`admin__badge ${c.replied ? 'admin__badge--active' : 'admin__badge--inactive'}`}>
                    {c.replied ? 'Replied' : 'Pending'}
                  </span>
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <button
                      className="admin__action-btn admin__action-btn--accent"
                      onClick={() => openReply(c)}
                    >
                      {c.replied ? 'Reply Again' : 'Reply'}
                    </button>
                    <button
                      className="admin__action-btn admin__action-btn--danger"
                      onClick={() => setDeleteTarget(c)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>No submissions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Contact"
          message={`Delete submission from ${deleteTarget.name}?`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {replyTarget && (
        <AdminFormModal
          title={`Reply to ${replyTarget.name}`}
          onClose={() => { setReplyTarget(null); setReplyBody(''); setInitialReplyBody(''); }}
          onSave={handleReply}
          saving={sending}
          saveLabel="Send"
          isDirty={isReplyDirty}
        >
          <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--color-surface, #f5f5f5)', borderRadius: 6, fontSize: '0.85rem', color: 'var(--color-text-muted, #888)' }}>
            <strong>Original message:</strong>
            <p style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap' }}>{replyTarget.message}</p>
          </div>
          {replyTarget.replied && replyTarget.repliedAt && (
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #888)', marginBottom: '0.75rem' }}>
              Previously replied on {formatDate(replyTarget.repliedAt)} by {replyTarget.repliedBy}
            </p>
          )}
          <label className="afm-label">Your reply</label>
          <textarea
            className="afm-textarea"
            rows={6}
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Type your reply..."
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #888)', marginTop: '0.25rem' }}>
            The visitor's original message will be included below your reply for context.
          </p>
        </AdminFormModal>
      )}

      {viewItem && (
        <div className="confirm-overlay" onClick={() => setViewItem(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 className="confirm-dialog__title">Message from {viewItem.name}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              {viewItem.email} &middot; {formatDate(viewItem.createdAt)}
            </p>
            <p className="confirm-dialog__message" style={{ whiteSpace: 'pre-wrap' }}>{viewItem.message}</p>
            {viewItem.replied && viewItem.replyMessage && (
              <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderLeft: '3px solid var(--color-accent)', background: 'var(--color-surface, #f5f5f5)', borderRadius: 4 }}>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>
                  Replied on {formatDate(viewItem.repliedAt!)} by {viewItem.repliedBy}
                </p>
                <p style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', margin: 0 }}>{viewItem.replyMessage}</p>
              </div>
            )}
            <div className="confirm-dialog__actions">
              <button className="confirm-dialog__btn confirm-dialog__btn--confirm" onClick={() => setViewItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
