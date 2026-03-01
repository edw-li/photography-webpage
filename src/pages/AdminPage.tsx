import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../api/client';
import './AdminPage.css';

type Tab = 'contacts' | 'subscribers' | 'users' | 'contests';

interface ContactItem {
  id: number;
  name: string;
  email: string;
  message: string;
  createdAt: string;
}

interface SubscriberItem {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
  subscribedAt: string;
}

interface UserItem {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface ContestItem {
  id: number;
  month: string;
  theme: string;
  status: string;
  submissionCount: number;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/* ─── Contacts Section ─── */

function ContactsSection() {
  const [items, setItems] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<ContactItem>>('/contact?page_size=100');
      setItems(data.items);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: number) => {
    await apiFetch(`/contact/${id}`, { method: 'DELETE' });
    load();
  };

  if (loading) return <p className="admin__loading">Loading contacts...</p>;

  return (
    <>
      <h2>Contact Submissions</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Message</th><th>Date</th><th>Action</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.email}</td>
                <td>{c.message.length > 80 ? c.message.slice(0, 80) + '...' : c.message}</td>
                <td>{formatDate(c.createdAt)}</td>
                <td>
                  <button className="admin__action-btn admin__action-btn--danger" onClick={() => handleDelete(c.id)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No submissions yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── Subscribers Section ─── */

function SubscribersSection() {
  const [items, setItems] = useState<SubscriberItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<SubscriberItem>>('/newsletters/subscribers?page_size=100');
      setItems(data.items);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: number) => {
    await apiFetch(`/newsletters/subscribers/${id}`, { method: 'PATCH' });
    load();
  };

  if (loading) return <p className="admin__loading">Loading subscribers...</p>;

  return (
    <>
      <h2>Newsletter Subscribers</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Name</th><th>Email</th><th>Status</th><th>Subscribed</th><th>Action</th></tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>
                  <span className={`admin__badge admin__badge--${s.isActive ? 'active' : 'inactive'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>{formatDate(s.subscribedAt)}</td>
                <td>
                  <button className="admin__action-btn" onClick={() => handleToggle(s.id)}>
                    {s.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No subscribers yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── Users Section ─── */

function UsersSection() {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Paginated<UserItem>>('/auth/users?page_size=100');
      setItems(data.items);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRoleChange = async (id: string, newRole: string) => {
    await apiFetch(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ role: newRole }),
    });
    load();
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    await apiFetch(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !isActive }),
    });
    load();
  };

  if (loading) return <p className="admin__loading">Loading users...</p>;

  return (
    <>
      <h2>Users</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>
                  <span className={`admin__badge admin__badge--${u.role}`}>
                    {u.role}
                  </span>
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
                  >
                    {u.role === 'admin' ? 'Demote' : 'Promote'}
                  </button>
                  <button
                    className="admin__action-btn"
                    onClick={() => handleToggleActive(u.id, u.isActive)}
                  >
                    {u.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── Contests Section ─── */

function ContestsSection() {
  const [items, setItems] = useState<ContestItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<ContestItem[]>('/contests/all');
      setItems(data);
    } catch { /* empty */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    await apiFetch(`/contests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  const nextStatus: Record<string, string> = {
    upcoming: 'active',
    active: 'voting',
    voting: 'completed',
  };

  if (loading) return <p className="admin__loading">Loading contests...</p>;

  return (
    <>
      <h2>Contests</h2>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Month</th><th>Theme</th><th>Status</th><th>Submissions</th><th>Action</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c.id}>
                <td>{c.month}</td>
                <td>{c.theme}</td>
                <td>
                  <span className={`admin__badge admin__badge--${c.status === 'active' ? 'active' : c.status === 'completed' ? 'inactive' : 'member'}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.submissionCount}</td>
                <td>
                  {nextStatus[c.status] && (
                    <button
                      className="admin__action-btn"
                      onClick={() => handleStatusChange(c.id, nextStatus[c.status])}
                    >
                      Move to {nextStatus[c.status]}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No contests yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── Admin Page ─── */

const TABS: { key: Tab; label: string }[] = [
  { key: 'contacts', label: 'Contacts' },
  { key: 'subscribers', label: 'Subscribers' },
  { key: 'users', label: 'Users' },
  { key: 'contests', label: 'Contests' },
];

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('contacts');

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/login');
    }
  }, [loading, isAdmin, navigate]);

  if (loading) return <div className="admin"><div className="container admin__loading">Loading...</div></div>;
  if (!isAdmin) return null;

  return (
    <div className="admin">
      <div className="container">
        <div className="admin__layout">
          <div className="admin__sidebar">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                className={`admin__tab${activeTab === tab.key ? ' admin__tab--active' : ''}`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="admin__content">
            {activeTab === 'contacts' && <ContactsSection />}
            {activeTab === 'subscribers' && <SubscribersSection />}
            {activeTab === 'users' && <UsersSection />}
            {activeTab === 'contests' && <ContestsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
