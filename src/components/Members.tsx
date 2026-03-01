import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import type { Member } from '../types/members';
import { getMembers } from '../api/members';
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
  const [slideDir, setSlideDir] = useState<'exit-up' | 'exit-down' | 'up' | 'down' | null>(null);
  const pageSize = usePageSize();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [expandPhase, setExpandPhase] = useState<'expand-enter' | 'collapse-grow' | null>(null);
  const [filterAnimPhase, setFilterAnimPhase] = useState<'exit' | 'enter' | null>(null);
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);
  const [filterVersion, setFilterVersion] = useState(0);
  const filtersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef<number | null>(null);
  const prevSearchWidthRef = useRef<number | null>(null);
  const controlsExpanded = filtersExpanded;
  const isSqueezing = expandPhase === 'collapse-grow';

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    getMembers({ pageSize: 100 })
      .then((res) => {
        setMembers(res.items);
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
    if (!hasNext || filterAnimPhase || expandPhase || slideDir) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setCurrentPage((p) => p + 1); return; }
    setSlideDir('exit-up');
  }, [hasNext, filterAnimPhase, expandPhase, slideDir]);

  const goToPrevPage = useCallback(() => {
    if (!hasPrev || filterAnimPhase || expandPhase || slideDir) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { setCurrentPage((p) => p - 1); return; }
    setSlideDir('exit-down');
  }, [hasPrev, filterAnimPhase, expandPhase, slideDir]);

  // Clamp currentPage when pageSize or filtered results change
  useEffect(() => {
    setCurrentPage((prev) => {
      const maxPage = Math.max(0, Math.ceil(filteredMembers.length / pageSize) - 1);
      return prev > maxPage ? maxPage : prev;
    });
  }, [pageSize, filteredMembers.length]);

  // FLIP height animation: expand-enter (controls container grows + search widens concurrently)
  useLayoutEffect(() => {
    if (expandPhase !== 'expand-enter') return;
    const el = controlsRef.current;
    const oldH = prevHeightRef.current;
    if (!el || oldH === null) return;
    prevHeightRef.current = null;

    // FLIP height
    const newH = el.scrollHeight;
    el.style.height = `${oldH}px`;
    el.style.overflow = 'hidden';
    void el.offsetHeight;
    el.style.transition = 'height 0.35s ease';
    el.style.height = `${newH}px`;

    // FLIP search width (if captured — only during expand, not collapse)
    const searchEl = searchRef.current;
    const startW = prevSearchWidthRef.current;
    if (searchEl && startW !== null) {
      prevSearchWidthRef.current = null;
      searchEl.style.flex = '0 0 auto';
      searchEl.style.width = `${startW}px`;
      void searchEl.offsetHeight;
      searchEl.style.transition = 'width 0.35s ease';
      searchEl.style.width = '100%';
    }

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'height') return;
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
      // Clear search FLIP styles if they were set
      if (searchEl && startW !== null) {
        searchEl.style.transition = 'none';
        searchEl.style.flex = '';
        searchEl.style.width = '';
        void searchEl.offsetHeight;
        searchEl.style.transition = '';
      }
    };
    el.addEventListener('transitionend', onEnd);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
      if (searchEl) {
        searchEl.style.flex = '';
        searchEl.style.width = '';
        searchEl.style.transition = '';
      }
    };
  }, [expandPhase]);

  // FLIP height animation: collapse-grow (controls container shrinks + search narrows concurrently)
  useLayoutEffect(() => {
    if (expandPhase !== 'collapse-grow') return;
    const el = controlsRef.current;
    const oldH = prevHeightRef.current;
    if (!el || oldH === null) return;
    prevHeightRef.current = null;

    const newH = el.scrollHeight;
    el.style.height = `${oldH}px`;
    el.style.overflow = 'hidden';
    void el.offsetHeight;
    el.style.transition = 'height 0.35s ease';
    el.style.height = `${newH}px`;

    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'height') return;
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
    };
    el.addEventListener('transitionend', onEnd);
    return () => {
      el.removeEventListener('transitionend', onEnd);
      el.style.height = '';
      el.style.overflow = '';
      el.style.transition = '';
    };
  }, [expandPhase]);

  // Catch-all fallback: force-complete if any phase lingers
  useEffect(() => {
    if (!expandPhase) return;
    const timer = setTimeout(() => {
      setExpandPhase(null);
      // Safety: clear inline styles
      const el = controlsRef.current;
      if (el) { el.style.height = ''; el.style.overflow = ''; el.style.transition = ''; }
      const sEl = searchRef.current;
      if (sEl) { sEl.style.flex = ''; sEl.style.width = ''; sEl.style.transition = ''; }
    }, 900);
    return () => clearTimeout(timer);
  }, [expandPhase]);

  const handleFilterChange = (specialty: string | null) => {
    if (specialty === activeFilter || filterAnimPhase || expandPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setActiveFilter(specialty);
      setCurrentPage(0);
      setFilterVersion((v) => v + 1);
      return;
    }
    setPendingFilter(specialty);
    setFilterAnimPhase('exit');
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
              <div className="fade-in-up">
              <div ref={controlsRef} className={`members__controls${controlsExpanded ? ' members__controls--expanded' : ''}${isSqueezing ? ' members__controls--squeezing' : ''}`}>
                <input
                  ref={searchRef}
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
                  ref={filtersRef}
                  className={[
                    'members__filters',
                    isSqueezing && 'members__filters--squeezing',
                    expandPhase === 'expand-enter' && 'members__filters--pill-enter',
                    expandPhase === 'collapse-grow' && 'members__filters--pill-enter-reverse',
                  ].filter(Boolean).join(' ')}
                  role="group"
                  aria-label="Filter by specialty"
                  onAnimationEnd={(e) => {
                    if (expandPhase === 'expand-enter' && e.animationName === 'filterPillFadeIn') {
                      if (e.target === filtersRef.current?.lastElementChild) {
                        setExpandPhase(null);
                      }
                    } else if (expandPhase === 'collapse-grow' && e.animationName === 'filterPillFadeIn') {
                      if (e.target === filtersRef.current?.firstElementChild) {
                        setExpandPhase(null);
                      }
                    }
                  }}
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
                      onClick={() => {
                        if (expandPhase || filterAnimPhase) return;
                        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        if (prefersReduced) {
                          setFiltersExpanded(true);
                          return;
                        }
                        const isMobile = window.innerWidth <= BREAKPOINTS.mobile;
                        if (isMobile) { setFiltersExpanded(true); return; }
                        prevSearchWidthRef.current = searchRef.current?.getBoundingClientRect().width ?? null;
                        const controlsEl = controlsRef.current;
                        if (controlsEl) prevHeightRef.current = controlsEl.getBoundingClientRect().height;
                        setFiltersExpanded(true);
                        setExpandPhase('expand-enter');
                      }}
                      aria-expanded={false}
                      aria-label={`Show ${hiddenCount} more filter options`}
                    >
                      +{hiddenCount} more
                    </button>
                  )}
                  {filtersExpanded && specialties.length > VISIBLE_FILTER_COUNT && (
                    <button
                      className="members__filter-pill members__filter-pill--toggle"
                      onClick={() => {
                        if (expandPhase || filterAnimPhase) return;
                        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                        if (prefersReduced) {
                          setFiltersExpanded(false);
                          return;
                        }
                        const isMobile = window.innerWidth <= BREAKPOINTS.mobile;
                        if (isMobile) { setFiltersExpanded(false); return; }
                        const controlsEl = controlsRef.current;
                        if (controlsEl) prevHeightRef.current = controlsEl.getBoundingClientRect().height;
                        setFiltersExpanded(false);
                        setExpandPhase('collapse-grow');
                      }}
                      aria-expanded={true}
                      aria-label="Show fewer filter options"
                    >
                      Show less
                    </button>
                  )}
                </div>
              </div>
              </div>
            )}

            <div className="members__grid-wrapper fade-in-up">
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
                  slideDir === 'exit-up' && 'members__grid--exit-up',
                  slideDir === 'exit-down' && 'members__grid--exit-down',
                  filterAnimPhase === 'exit' && 'members__grid--filter-exit',
                  filterAnimPhase === 'enter' && 'members__grid--filter-enter',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={`${currentPage}-${filterVersion}`}
                onAnimationEnd={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (filterAnimPhase === 'exit') {
                    setActiveFilter(pendingFilter);
                    setCurrentPage(0);
                    setFilterVersion((v) => v + 1);
                    setFilterAnimPhase('enter');
                  } else if (filterAnimPhase === 'enter') {
                    setFilterAnimPhase(null);
                  } else if (slideDir === 'exit-up') {
                    setCurrentPage((p) => p + 1);
                    setSlideDir('up');
                  } else if (slideDir === 'exit-down') {
                    setCurrentPage((p) => p - 1);
                    setSlideDir('down');
                  } else {
                    setSlideDir(null);
                  }
                }}
              >
                {displayedMembers.map((member) => (
                  <MemberCard
                    key={member.name}
                    member={member}
                    onClick={() => setSelectedMember(member)}
                  />
                ))}
                {displayedMembers.length > 0 && displayedMembers.length < pageSize &&
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

              <p className={`members__page-indicator${filteredMembers.length === 0 ? ' members__page-indicator--hidden' : ''}`}>
                {filteredMembers.length > 0 ? `Page ${currentPage + 1} of ${totalPages}` : '\u00a0'}
              </p>
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
