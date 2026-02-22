import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, GraduationCap, Handshake, Image, Trophy, Users } from 'lucide-react';
import type { Member, MembersConfig } from '../types/members';
import MemberModal from './MemberModal';
import './About.css';

type TabId = 'mission' | 'story' | 'benefits' | 'leadership';

const TABS: { id: TabId; label: string }[] = [
  { id: 'mission', label: 'Our Mission' },
  { id: 'story', label: 'Our Story' },
  { id: 'leadership', label: 'Leadership Team' },
  { id: 'benefits', label: 'Membership Benefits' },
];

function MissionContent() {
  return (
    <div className="about__grid">
      <div className="about__text">
        <h3>Our Mission</h3>
        <p>
          At Bridgeway Photography, we believe photography is more than just
          capturing images — it's about telling stories, preserving memories,
          and seeing the world through a creative lens. Founded in 2018, our
          club brings together photographers of all skill levels to learn,
          share, and grow together.
        </p>
        <p>
          Whether you're picking up a camera for the first time or you've
          been shooting for decades, there's a place for you here.
        </p>
      </div>
      <div className="about__image">
        <img
          src="https://picsum.photos/id/1025/600/700"
          alt="Photography club members on a photo walk"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function StoryContent() {
  return (
    <div className="about__grid about__grid--reversed">
      <div className="about__text">
        <h3>Our Story</h3>
        <p>
          What started as a small group of five friends meeting at a local
          coffee shop has grown into a thriving community of over 50 active
          members. From weekend photo walks to gallery exhibitions, we've
          built a space where creativity flourishes and lasting friendships
          are formed.
        </p>
        <p>
          Over the years, our members have been featured in local galleries,
          won regional photography contests, and collaborated on community
          projects that showcase the beauty of our neighborhoods and the
          stories of the people who live in them.
        </p>
      </div>
      <div className="about__image">
        <img
          src="https://picsum.photos/id/1067/600/700"
          alt="Club members at a gallery exhibition"
          loading="lazy"
        />
      </div>
    </div>
  );
}

const BENEFITS = [
  { icon: Camera, title: 'Equipment Access', description: 'Borrow lenses, lighting, and accessories from our collection.' },
  { icon: GraduationCap, title: 'Workshops & Tutorials', description: 'Monthly workshops on composition, editing, and lighting.' },
  { icon: Image, title: 'Gallery Features', description: 'Showcase your work in our gallery and exhibitions.' },
  { icon: Users, title: 'Community & Networking', description: 'Connect with photographers and build lasting friendships.' },
  { icon: Trophy, title: 'Photo Contests', description: 'Compete in monthly themed challenges and win prizes.' },
  { icon: Handshake, title: 'Mentorship Program', description: 'Get paired with experienced photographers for guidance.' },
];

function BenefitsContent() {
  return (
    <div className="about__grid about__grid--reversed">
      <div className="about__image">
        <img
          src="https://picsum.photos/id/1073/600/700"
          alt="Members collaborating during a workshop"
          loading="lazy"
        />
      </div>
      <div className="about__benefits-cards">
        {BENEFITS.map((benefit) => (
          <div className="about__benefit-card" key={benefit.title}>
            <div className="about__benefit-front">
              <benefit.icon className="about__benefit-icon" size={32} />
              <h4>{benefit.title}</h4>
            </div>
            <div className="about__benefit-back">
              <p>{benefit.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LeadershipContent({
  members,
  onMemberClick,
}: {
  members: Member[];
  onMemberClick: (member: Member) => void;
}) {
  return (
    <div className="about__grid">
      <div className="about__leadership-cards">
        {members.map((member) => (
          <div
            className="about__leader-card about__leader-card--clickable"
            key={member.name}
            onClick={() => onMemberClick(member)}
          >
            <div className="about__leader-avatar">
              <img src={member.avatar} alt={member.name} loading="lazy" />
            </div>
            <h4>{member.name}</h4>
            <span className="about__leader-role">{member.leadershipRole}</span>
          </div>
        ))}
      </div>
      <div className="about__image">
        <img
          src="https://picsum.photos/id/1060/600/700"
          alt="Leadership team at a club event"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function TabContent({
  activeTab,
  leaders,
  onMemberClick,
}: {
  activeTab: TabId;
  leaders: Member[];
  onMemberClick: (member: Member) => void;
}) {
  switch (activeTab) {
    case 'mission':
      return <MissionContent />;
    case 'story':
      return <StoryContent />;
    case 'benefits':
      return <BenefitsContent />;
    case 'leadership':
      return <LeadershipContent members={leaders} onMemberClick={onMemberClick} />;
  }
}

export default function About() {
  const [activeTab, setActiveTab] = useState<TabId>('mission');
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  useEffect(() => {
    import('../data/members.json').then((mod) => {
      const config = (mod.default ?? mod) as MembersConfig;
      setMembers(config.members);
    });
  }, []);

  const leaders = members.filter(m => m.leadershipRole);

  const updateIndicator = useCallback(() => {
    if (!tabsRef.current) return;
    const activeButton = tabsRef.current.querySelector<HTMLButtonElement>(
      '.about__tab--active'
    );
    if (activeButton) {
      const tabsRect = tabsRef.current.getBoundingClientRect();
      const btnRect = activeButton.getBoundingClientRect();
      setIndicator({
        left: btnRect.left - tabsRect.left,
        width: btnRect.width,
      });
    }
  }, []);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeTab, updateIndicator]);

  return (
    <section id="about" className="about section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>About Us</h2>
          <p>Learn more about our passionate community of photographers</p>
        </div>

        <div className="about__tabs fade-in-up" ref={tabsRef} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`about__tab${activeTab === tab.id ? ' about__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <span
            className="about__tab-indicator"
            style={{ left: indicator.left, width: indicator.width }}
          />
        </div>

        <div className="about__content-wrapper fade-in-up">
          <div
            className="about__content"
            key={activeTab}
            role="tabpanel"
            aria-labelledby={activeTab}
          >
            <TabContent
              activeTab={activeTab}
              leaders={leaders}
              onMemberClick={setSelectedMember}
            />
          </div>
        </div>
      </div>

      <MemberModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </section>
  );
}
