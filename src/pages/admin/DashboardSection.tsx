import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client';
import { getActivityLog } from '../../api/activity';
import type { Paginated, ContactItem, ActivityItem } from './types';
import { formatDate } from './types';

interface StatCard {
  label: string;
  count: number;
  tab: string;
}

interface Props {
  onNavigate: (tab: string) => void;
}

export default function DashboardSection({ onNavigate }: Props) {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [recentContacts, setRecentContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      const fetchCount = async (path: string): Promise<number> => {
        try {
          const data = await apiFetch<Paginated<unknown>>(`${path}?page=1&page_size=1`);
          return data.total;
        } catch {
          return 0;
        }
      };

      try {
        const [members, gallery, events, newsletters, contests, users, subscribers, contacts] = await Promise.all([
          fetchCount('/members'),
          fetchCount('/gallery'),
          apiFetch<unknown[]>('/events/all').then((a) => a.length).catch(() => 0),
          fetchCount('/newsletters'),
          apiFetch<unknown[]>('/contests/all').then((a) => a.length).catch(() => 0),
          fetchCount('/auth/users'),
          fetchCount('/newsletters/subscribers'),
          fetchCount('/contact'),
        ]);

        setStats([
          { label: 'Members', count: members, tab: 'members' },
          { label: 'Gallery Photos', count: gallery, tab: 'gallery' },
          { label: 'Events', count: events, tab: 'events' },
          { label: 'Newsletters', count: newsletters, tab: 'newsletters' },
          { label: 'Contests', count: contests, tab: 'contests' },
          { label: 'Users', count: users, tab: 'users' },
          { label: 'Subscribers', count: subscribers, tab: 'subscribers' },
          { label: 'Contacts', count: contacts, tab: 'contacts' },
        ]);
      } catch { /* stats failed gracefully */ }

      try {
        const activityData = await getActivityLog(1, 10);
        setActivities(activityData.items);
      } catch { /* no activity yet */ }

      try {
        const contactData = await apiFetch<Paginated<ContactItem>>('/contact?page=1&page_size=5');
        setRecentContacts(contactData.items);
      } catch { /* no contacts */ }

      setLoading(false);
    };
    loadAll();
  }, []);

  if (loading) return <p className="admin__loading">Loading dashboard...</p>;

  return (
    <>
      <h2>Dashboard</h2>
      <div className="admin__stat-grid">
        {stats.map((s) => (
          <button
            key={s.tab}
            className="admin__stat-card"
            onClick={() => onNavigate(s.tab)}
          >
            <span className="admin__stat-count">{s.count}</span>
            <span className="admin__stat-label">{s.label}</span>
          </button>
        ))}
      </div>

      <div className="admin__dashboard-row">
        <div className="admin__dashboard-col">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>Recent Activity</h3>
          {activities.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No activity yet</p>
          ) : (
            <div className="admin__activity-feed">
              {activities.map((a) => (
                <div key={a.id} className="admin__activity-item">
                  <div className="admin__activity-desc">
                    <span className={`admin__badge admin__badge--${a.action === 'delete' ? 'inactive' : a.action === 'create' ? 'active' : 'member'}`} style={{ marginRight: '0.5rem', fontSize: '0.7rem' }}>
                      {a.action}
                    </span>
                    {a.description}
                  </div>
                  <div className="admin__activity-meta">
                    {a.adminEmail} &middot; {formatDate(a.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin__dashboard-col">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>Recent Contacts</h3>
          {recentContacts.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>No contact submissions</p>
          ) : (
            <div className="admin__activity-feed">
              {recentContacts.map((c) => (
                <div key={c.id} className="admin__activity-item" style={{ cursor: 'pointer' }} onClick={() => onNavigate('contacts')}>
                  <div className="admin__activity-desc">
                    <strong>{c.name}</strong> — {c.message.length > 60 ? c.message.slice(0, 60) + '...' : c.message}
                  </div>
                  <div className="admin__activity-meta">
                    {c.email} &middot; {formatDate(c.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
