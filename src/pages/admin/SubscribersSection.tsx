import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { SubscriberItem, Paginated } from './types';
import { formatDate } from './types';
import Pagination from './Pagination';

export default function SubscribersSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<SubscriberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SubscriberItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<SubscriberItem>>(`/newsletters/subscribers?page=${p}&page_size=${pageSize}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load subscribers');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);

  const handleToggle = async (id: number) => {
    setLoadingId(id);
    try {
      await apiFetch(`/newsletters/subscribers/${id}`, { method: 'PATCH' });
      addToast('success', 'Subscriber status updated');
      load(page);
    } catch {
      addToast('error', 'Failed to update subscriber');
    }
    setLoadingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/newsletters/subscribers/${deleteTarget.id}`, { method: 'DELETE' });
      addToast('success', 'Subscriber deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete subscriber');
    }
    setDeleting(false);
  };

  const filtered = search
    ? items.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.email.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  if (loading) return <p className="admin__loading">Loading subscribers...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search subscribers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Subscribed</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>
                  <span className={`admin__badge admin__badge--${s.isActive ? 'active' : 'inactive'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{formatDate(s.subscribedAt)}</td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <button
                      className="admin__action-btn"
                      onClick={() => handleToggle(s.id)}
                      disabled={loadingId === s.id}
                      style={loadingId === s.id ? { opacity: 0.6 } : undefined}
                    >
                      {s.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      className="admin__action-btn admin__action-btn--danger"
                      onClick={() => setDeleteTarget(s)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No subscribers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Subscriber"
          message={`Delete subscriber ${deleteTarget.name} (${deleteTarget.email})?`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
