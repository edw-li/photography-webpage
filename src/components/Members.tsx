import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Member, MembersConfig } from '../types/members';
import { useImageLoaded } from '../hooks/useImageLoaded';
import MemberModal from './MemberModal';
import './Members.css';

const INITIAL_COUNT = 8;
const LOAD_INCREMENT = 8;
const VISIBLE_FILTER_COUNT = 5;

function shortenSpecialty(s: string): string {
  if (s === 'Astrophotography') return 'Astro';
  return s.replace(/ Photography$/, '');
}

function MemberCard({ member, onClick }: { member: Member; onClick: () => void }) {
  const { loaded, handleLoad, handleError } = useImageLoaded(member.avatar);
  return (
    <div className="members__card members__card--clickable" onClick={onClick}>
      <div className={`members__avatar${!loaded ? ' shimmer-bg' : ''}`}>
        <img
          src={member.avatar}
          alt={member.name}
          loading="lazy"
          className={`img-fade${loaded ? ' img-fade--loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
      <h3>{member.name}</h3>
      <p>{member.specialty}</p>
    </div>
  );
}

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    import('../data/members.json')
      .then((mod) => {
        const config = (mod.default ?? mod) as MembersConfig;
        setMembers(config.members);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const specialties = useMemo(
    () => [...new Set(members.map((m) => m.specialty))],
    [members]
  );

  const { visibleSpecialties, hiddenCount } = useMemo(() => {
    if (filtersExpanded) {
      return { visibleSpecialties: specialties, hiddenCount: 0 };
    }
    const initial = specialties.slice(0, VISIBLE_FILTER_COUNT);
    const rest = specialties.slice(VISIBLE_FILTER_COUNT);

    // If active filter is hidden, swap it into the last visible slot
    if (activeFilter && rest.includes(activeFilter)) {
      const swapped = [...initial];
      swapped[swapped.length - 1] = activeFilter;
      return { visibleSpecialties: swapped, hiddenCount: rest.length };
    }

    return { visibleSpecialties: initial, hiddenCount: rest.length };
  }, [specialties, filtersExpanded, activeFilter]);

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

        {loading && (
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        )}

        {error && (
          <div className="section-error">
            <p>Something went wrong loading members.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
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
                <div
                  className={`members__filters${filtersExpanded ? ' members__filters--expanded' : ''}`}
                  role="group"
                  aria-label="Filter by specialty"
                >
                  <button
                    className={`members__filter-pill${activeFilter === null ? ' members__filter-pill--active' : ''}`}
                    onClick={() => handleFilterChange(null)}
                  >
                    All
                  </button>
                  {visibleSpecialties.map((s) => (
                    <button
                      key={s}
                      className={`members__filter-pill${activeFilter === s ? ' members__filter-pill--active' : ''}`}
                      onClick={() => handleFilterChange(s)}
                      title={s}
                    >
                      {shortenSpecialty(s)}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <button
                      className="members__filter-pill members__filter-pill--toggle"
                      onClick={() => setFiltersExpanded(true)}
                      aria-expanded={false}
                      aria-label={`Show ${hiddenCount} more filter options`}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {filtersExpanded && specialties.length > VISIBLE_FILTER_COUNT && (
                    <button
                      className="members__filter-pill members__filter-pill--toggle"
                      onClick={() => setFiltersExpanded(false)}
                      aria-expanded={true}
                      aria-label="Show fewer filter options"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="members__grid">
              {displayedMembers.map((member) => (
                <MemberCard
                  key={member.name}
                  member={member}
                  onClick={() => setSelectedMember(member)}
                />
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
          </>
        )}
      </div>

      <MemberModal
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
      />
    </section>
  );
}
