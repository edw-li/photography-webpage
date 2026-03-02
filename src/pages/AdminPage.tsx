import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './AdminPage.css';

import DashboardSection from './admin/DashboardSection';
import EventsSection from './admin/EventsSection';
import NewslettersSection from './admin/NewslettersSection';
import GallerySection from './admin/GallerySection';
import MembersSection from './admin/MembersSection';
import ContestsSection from './admin/ContestsSection';
import UsersSection from './admin/UsersSection';
import SubscribersSection from './admin/SubscribersSection';
import ContactsSection from './admin/ContactsSection';

type Tab = 'dashboard' | 'events' | 'newsletters' | 'gallery' | 'members'
  | 'contests' | 'users' | 'subscribers' | 'contacts';

interface TabGroup {
  header: string | null;
  tabs: { key: Tab; label: string }[];
}

const TAB_GROUPS: TabGroup[] = [
  {
    header: null,
    tabs: [{ key: 'dashboard', label: 'Dashboard' }],
  },
  {
    header: 'Content',
    tabs: [
      { key: 'events', label: 'Events' },
      { key: 'newsletters', label: 'Newsletters' },
      { key: 'gallery', label: 'Gallery' },
      { key: 'members', label: 'Members' },
    ],
  },
  {
    header: 'Management',
    tabs: [
      { key: 'contests', label: 'Contests' },
      { key: 'users', label: 'Users' },
      { key: 'subscribers', label: 'Subscribers' },
      { key: 'contacts', label: 'Contacts' },
    ],
  },
];

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/login');
    }
  }, [loading, isAdmin, navigate]);

  if (loading) return <div className="admin"><div className="container admin__loading">Loading...</div></div>;
  if (!isAdmin) return null;

  const renderSection = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardSection onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case 'events': return <EventsSection />;
      case 'newsletters': return <NewslettersSection />;
      case 'gallery': return <GallerySection />;
      case 'members': return <MembersSection />;
      case 'contests': return <ContestsSection />;
      case 'users': return <UsersSection />;
      case 'subscribers': return <SubscribersSection />;
      case 'contacts': return <ContactsSection />;
    }
  };

  return (
    <div className="admin">
      <div className="container">
        <div className="admin__layout">
          <div className="admin__sidebar">
            {TAB_GROUPS.map((group, gi) => (
              <div key={gi}>
                {group.header && (
                  <div className="admin__sidebar-header">{group.header}</div>
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`admin__tab${activeTab === tab.key ? ' admin__tab--active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="admin__content">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
