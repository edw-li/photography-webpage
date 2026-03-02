import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import type { UserItem, Paginated } from './types';
import { formatDate } from './types';
import Pagination from './Pagination';

export default function UsersSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserItem | null>(null);
  const [confirming, setConfirming] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<UserItem>>(`/auth/users?page=${p}&page_size=${pageSize}`);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load users');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);

  const handleRoleChange = async (id: string, newRole: string) => {
    setLoadingId(id);
    try {
      await apiFetch(`/auth/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      addToast('success', `User ${newRole === 'admin' ? 'promoted' : 'demoted'}`);
      load(page);
    } catch {
      addToast('error', 'Failed to change user role');
    }
    setLoadingId(null);
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setConfirming(true);
    try {
      await apiFetch(`/auth/users/${deactivateTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !deactivateTarget.isActive }),
      });
      addToast('success', `User ${deactivateTarget.isActive ? 'deactivated' : 'activated'}`);
      setDeactivateTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to update user status');
    }
    setConfirming(false);
  };

  const filtered = search
    ? items.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()))
    : items;

  if (loading) return <p className="admin__loading">Loading users...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  <span className={`admin__badge admin__badge--${u.role}`}>{u.role}</span>
                </td>
                <td>
                  <span className={`admin__badge admin__badge--${u.isActive ? 'active' : 'inactive'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{formatDate(u.createdAt)}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="admin__action-btn"
                    onClick={() => handleRoleChange(u.id, u.role === 'admin' ? 'member' : 'admin')}
                    disabled={loadingId === u.id}
                    style={loadingId === u.id ? { opacity: 0.6 } : undefined}
                  >
                    {u.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  <button
                    className="admin__action-btn"
                    onClick={() => setDeactivateTarget(u)}
                    disabled={loadingId === u.id}
                    style={loadingId === u.id ? { opacity: 0.6 } : undefined}
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {deactivateTarget && (
        <ConfirmDialog
          title={deactivateTarget.isActive ? 'Deactivate User' : 'Activate User'}
          message={`${deactivateTarget.isActive ? 'Deactivate' : 'Activate'} ${deactivateTarget.email}?`}
          confirmLabel={deactivateTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={deactivateTarget.isActive}
          loading={confirming}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </>
  );
}
