import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Member, MembersConfig } from '../types/members';
import { useImageLoaded } from '../hooks/useImageLoaded';
import MemberModal from './MemberModal';
import './Members.css';

const PAGE_SIZES = { desktop: 8, tablet: 4, mobile: 3 } as const;
const BREAKPOINTS = { tablet: 1024, mobile: 480 } as const;
const VISIBLE_FILTER_COUNT = 5;

function usePageSize(): number {
  const getSize = () => {
    if (typeof window === 'undefined') return PAGE_SIZES.desktop;
    if (window.innerWidth <= BREAKPOINTS.mobile) return PAGE_SIZES.mobile;
    if (window.innerWidth <= BREAKPOINTS.tablet) return PAGE_SIZES.tablet;
    return PAGE_SIZES.desktop;
  };

  const [pageSize, setPageSize] = useState(getSize);

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${BREAKPOINTS.mobile}px)`);
    const tabletQuery = window.matchMedia(`(max-width: ${BREAKPOINTS.tablet}px)`);
    const update = () => setPageSize(getSize());
    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
    };
  }, []);

  return pageSize;
}

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
  const [currentPage, setCurrentPage] = useState(0);
  const [slideDir, setSlideDir] = useState<'up' | 'down' | null>(null);
  const pageSize = usePageSize();
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

  const totalPages = Math.ceil(filteredMembers.length / pageSize);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;
  const displayedMembers = filteredMembers.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  );
  const showControls = members.length > PAGE_SIZES.mobile;

  const goToNextPage = useCallback(() => {
    if (!hasNext) return;
    setSlideDir('up');
    setCurrentPage((p) => p + 1);
  }, [hasNext]);

  const goToPrevPage = useCallback(() => {
    if (!hasPrev) return;
    setSlideDir('down');
    setCurrentPage((p) => p - 1);
  }, [hasPrev]);

  // Clamp currentPage when pageSize or filtered results change
  useEffect(() => {
    setCurrentPage((prev) => {
      const maxPage = Math.max(0, Math.ceil(filteredMembers.length / pageSize) - 1);
      return prev > maxPage ? maxPage : prev;
    });
  }, [pageSize, filteredMembers.length]);

  const handleFilterChange = (specialty: string | null) => {
    setActiveFilter(specialty);
    setCurrentPage(0);
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
                    setCurrentPage(0);
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

            <div className="members__grid-wrapper">
              <button
                className={`members__page-nav members__page-nav--up${!hasPrev ? ' members__page-nav--hidden' : ''}`}
                onClick={goToPrevPage}
                aria-label="Previous page"
                aria-hidden={!hasPrev}
                tabIndex={hasPrev ? 0 : -1}
              >
                &#x25B2;
              </button>

              <div
                className={[
                  'members__grid',
                  slideDir === 'up' && 'members__grid--slide-from-below',
                  slideDir === 'down' && 'members__grid--slide-from-above',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={currentPage}
                onAnimationEnd={() => setSlideDir(null)}
              >
                {displayedMembers.map((member) => (
                  <MemberCard
                    key={member.name}
                    member={member}
                    onClick={() => setSelectedMember(member)}
                  />
                ))}
                {totalPages > 1 &&
                  Array.from({ length: pageSize - displayedMembers.length }, (_, i) => (
                    <div key={`placeholder-${i}`} className="members__card members__card--placeholder" aria-hidden="true">
                      <div className="members__avatar" />
                      <h3>&nbsp;</h3>
                      <p>&nbsp;</p>
                    </div>
                  ))}
              </div>

              {filteredMembers.length === 0 && (
                <p className="members__empty">No members match your search.</p>
              )}

              <button
                className={`members__page-nav members__page-nav--down${!hasNext ? ' members__page-nav--hidden' : ''}`}
                onClick={goToNextPage}
                aria-label="Next page"
                aria-hidden={!hasNext}
                tabIndex={hasNext ? 0 : -1}
              >
                &#x25BC;
              </button>

              {totalPages > 1 && (
                <p className="members__page-indicator">
                  Page {currentPage + 1} of {totalPages}
                </p>
              )}
            </div>
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
