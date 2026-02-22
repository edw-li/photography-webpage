import { useState, useEffect, useMemo } from 'react';
import type { Member, MembersConfig } from '../types/members';
import MemberModal from './MemberModal';
import './Members.css';

const INITIAL_COUNT = 8;
const LOAD_INCREMENT = 8;

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    import('../data/members.json').then((mod) => {
      const config = (mod.default ?? mod) as MembersConfig;
      setMembers(config.members);
    });
  }, []);

  const specialties = useMemo(
    () => [...new Set(members.map((m) => m.specialty))],
    [members]
  );

  const filteredMembers = useMemo(() => {
    let result = members;
    if (activeFilter) {
      result = result.filter((m) => m.specialty === activeFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.specialty.toLowerCase().includes(q)
      );
    }
    return result;
  }, [members, activeFilter, searchQuery]);

  const displayedMembers = filteredMembers.slice(0, visibleCount);
  const remaining = filteredMembers.length - visibleCount;
  const showControls = members.length > INITIAL_COUNT;

  const handleFilterChange = (specialty: string | null) => {
    setActiveFilter(specialty);
    setVisibleCount(INITIAL_COUNT);
  };

  return (
    <section id="members" className="members section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Our Members</h2>
          <p>Meet some of the talented photographers in our community</p>
        </div>

        {showControls && (
          <div className="members__controls">
            <input
              type="text"
              className="members__search"
              placeholder="Search by name or specialty..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleCount(INITIAL_COUNT);
              }}
            />
            <div className="members__filters">
              <button
                className={`members__filter-pill${activeFilter === null ? ' members__filter-pill--active' : ''}`}
                onClick={() => handleFilterChange(null)}
              >
                All
              </button>
              {specialties.map((s) => (
                <button
                  key={s}
                  className={`members__filter-pill${activeFilter === s ? ' members__filter-pill--active' : ''}`}
                  onClick={() => handleFilterChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="members__grid">
          {displayedMembers.map((member) => (
            <div
              className="members__card members__card--clickable"
              key={member.name}
              onClick={() => setSelectedMember(member)}
            >
              <div className="members__avatar">
                <img src={member.avatar} alt={member.name} loading="lazy" />
              </div>
              <h3>{member.name}</h3>
              <p>{member.specialty}</p>
            </div>
          ))}
        </div>

        {(remaining > 0 || visibleCount > INITIAL_COUNT) && (
          <div className="members__actions">
            {remaining > 0 && (
              <button
                className="members__show-btn"
                onClick={() => setVisibleCount((c) => c + LOAD_INCREMENT)}
              >
                Show More ({remaining} remaining)
              </button>
            )}
            {visibleCount > INITIAL_COUNT && (
              <button
                className="members__show-btn members__show-btn--less"
                onClick={() => setVisibleCount(INITIAL_COUNT)}
              >
                Show Less
              </button>
            )}
          </div>
        )}
      </div>

      <MemberModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </section>
  );
}
