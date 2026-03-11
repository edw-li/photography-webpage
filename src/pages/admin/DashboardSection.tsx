import { useState, useEffect } from 'react';
import { apiFetch } from '../../api/client';
import { getActivityLog } from '../../api/activity';
import type { Paginated, ContactItem, ActivityItem } from './types';
import { formatDate } from './types';

interface StatCard {
  label: string;
  count: number;
  tab: string;
  error?: boolean;
}

interface Props {
  onNavigate: (tab: string) => void;
}

export default function DashboardSection({ onNavigate }: Props) {
  const [stats, setStats] = useState<StatCard[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [recentContacts, setRecentContacts] = useState<ContactItem[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [contactsError, setContactsError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      setActivityError(false);
      setContactsError(false);

      const fetchCount = async (path: string): Promise<{ count: number; error: boolean }> => {
        try {
          const data = await apiFetch<Paginated<unknown>>(`${path}?page=1&page_size=1`);
          return { count: data.total, error: false };
        } catch {
          return { count: 0, error: true };
        }
      };

      const fetchArrayCount = async (path: string): Promise<{ count: number; error: boolean }> => {
        try {
          const data = await apiFetch<unknown[]>(path);
          return { count: data.length, error: false };
        } catch {
          return { count: 0, error: true };
        }
      };

      try {
        const [members, gallery, events, newsletters, contests, subscribers, contacts] = await Promise.all([
          fetchCount('/members'),
          fetchCount('/gallery'),
          fetchArrayCount('/events/all'),
          fetchCount('/newsletters'),
          fetchArrayCount('/contests/all'),
          fetchCount('/newsletters/subscribers'),
          fetchCount('/contact'),
        ]);

        setStats([
          { label: 'Members', count: members.count, tab: 'members', error: members.error },
          { label: 'Gallery Photos', count: gallery.count, tab: 'gallery', error: gallery.error },
          { label: 'Events', count: events.count, tab: 'events', error: events.error },
          { label: 'Newsletters', count: newsletters.count, tab: 'newsletters', error: newsletters.error },
          { label: 'Contests', count: contests.count, tab: 'contests', error: contests.error },
          { label: 'Subscribers', count: subscribers.count, tab: 'subscribers', error: subscribers.error },
          { label: 'Contacts', count: contacts.count, tab: 'contacts', error: contacts.error },
        ]);
      } catch { /* stats failed gracefully */ }

      try {
        const activityData = await getActivityLog(1, 10);
        setActivities(activityData.items);
      } catch {
        setActivityError(true);
      }

      try {
        const contactData = await apiFetch<Paginated<ContactItem>>('/contact?page=1&page_size=5');
        setRecentContacts(contactData.items);
      } catch {
        setContactsError(true);
      }

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
            className={`admin__stat-card${s.error ? ' admin__stat-card--error' : ''}`}
            onClick={() => onNavigate(s.tab)}
          >
            <span className="admin__stat-count">
              {s.error ? 'N/A' : s.count}
            </span>
            <span className="admin__stat-label">{s.label}</span>
            {s.error && (
              <span className="admin__stat-error">Failed to load</span>
            )}
          </button>
        ))}
      </div>

      <div className="admin__dashboard-row">
        <div className="admin__dashboard-col">
          <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: 'var(--color-text)' }}>Recent Activity</h3>
          {activityError ? (
            <p style={{ fontSize: '0.85rem', color: '#ef4444' }}>Failed to load activity data.</p>
          ) : activities.length === 0 ? (
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
          {contactsError ? (
            <p style={{ fontSize: '0.85rem', color: '#ef4444' }}>Failed to load contact data.</p>
          ) : recentContacts.length === 0 ? (
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
