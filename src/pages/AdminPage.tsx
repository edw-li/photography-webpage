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
import SubscribersSection from './admin/SubscribersSection';
import ContactsSection from './admin/ContactsSection';
import AnnouncementsSection from './admin/AnnouncementsSection';

type Tab = 'dashboard' | 'events' | 'newsletters' | 'gallery' | 'members'
  | 'contests' | 'subscribers' | 'contacts' | 'announcements';

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
      { key: 'announcements', label: 'Announcements' },
      { key: 'gallery', label: 'Gallery' },
    ],
  },
  {
    header: 'Management',
    tabs: [
      { key: 'members', label: 'Members' },
      { key: 'contests', label: 'Contests' },
      { key: 'subscribers', label: 'Subscribers' },
      { key: 'contacts', label: 'Contacts' },
    ],
  },
];

export default function AdminPage() {
  const { isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/login');
    }
  }, [loading, isAdmin, navigate]);

  // Close sidebar on resize above mobile breakpoint
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 768) setSidebarOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (loading) return <div className="admin"><div className="container admin__loading">Loading...</div></div>;
  if (!isAdmin) return null;

  const handleTabSelect = (tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const renderSection = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardSection onNavigate={(tab) => handleTabSelect(tab as Tab)} />;
      case 'events': return <EventsSection />;
      case 'newsletters': return <NewslettersSection />;
      case 'gallery': return <GallerySection />;
      case 'members': return <MembersSection />;
      case 'contests': return <ContestsSection />;
      case 'subscribers': return <SubscribersSection />;
      case 'contacts': return <ContactsSection />;
      case 'announcements': return <AnnouncementsSection />;
    }
  };

  return (
    <div className="admin">
      {/* Hero */}
      <div className="admin__hero">
        <div className="admin__hero-bg">
          <img
            src="https://picsum.photos/seed/landscape/1600/600"
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="admin__hero-content container">
          <h1>Admin Console</h1>
          <p>Manage your photography club</p>
        </div>
      </div>

      <div className="container">
        <button
          className="admin__sidebar-toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={sidebarOpen}
        >
          &#9776;
        </button>
        <div className="admin__layout">
          {sidebarOpen && (
            <div
              className="admin__sidebar-overlay"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          <nav className={`admin__sidebar${sidebarOpen ? ' admin__sidebar--open' : ''}`}>
            {TAB_GROUPS.map((group, gi) => (
              <div key={gi}>
                {group.header && (
                  <div className="admin__sidebar-header">{group.header}</div>
                )}
                {group.tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`admin__tab${activeTab === tab.key ? ' admin__tab--active' : ''}`}
                    onClick={() => handleTabSelect(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="admin__content" key={activeTab}>
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
