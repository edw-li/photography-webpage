import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
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
            <tr><th>Name</th><th>Email</th><th>Message</th><th>Date</th><th>Action</th></tr>
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
                  <button
                    className="admin__action-btn admin__action-btn--danger"
                    onClick={() => setDeleteTarget(c)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No submissions yet</td></tr>
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

      {viewItem && (
        <div className="confirm-overlay" onClick={() => setViewItem(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 className="confirm-dialog__title">Message from {viewItem.name}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
              {viewItem.email} &middot; {formatDate(viewItem.createdAt)}
            </p>
            <p className="confirm-dialog__message" style={{ whiteSpace: 'pre-wrap' }}>{viewItem.message}</p>
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
