import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyResults } from '../api/contests';
import { getCategoryLabel } from '../types/contest';
import type {
  MyResultsResponse,
  MyResultsContest,
  CategoryResult,
  SubmissionResult,
  LeaderboardRanking,
  VoteCategory,
} from '../types/contest';
import type { PhotoExif } from '../types/gallery';
import { getImageUrl } from '../utils/imageUrl';
import { useImageLoaded } from '../hooks/useImageLoaded';
import { Trophy, Award, TrendingUp, Calendar, Star, X } from 'lucide-react';
import './MyResultsPage.css';

/* ── Helpers ─────────────────────────────────── */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatMonth(month: string): string {
  const [year, m] = month.split('-');
  const mi = parseInt(m, 10);
  if (!year || isNaN(mi) || mi < 1 || mi > 12) return month;
  return `${SHORT_MONTHS[mi - 1]} '${year.slice(2)}`;
}

function formatExif(exif: PhotoExif | null | undefined): string | null {
  if (!exif) return null;
  const parts: string[] = [];
  if (exif.camera) parts.push(exif.camera);
  if (exif.focalLength) parts.push(exif.focalLength);
  if (exif.aperture) parts.push(exif.aperture);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  if (exif.iso != null) parts.push(`ISO ${exif.iso}`);
  return parts.length > 0 ? parts.join(' \u00b7 ') : null;
}

function placeLabel(place: number): string {
  if (place === 1) return '1st Place';
  if (place === 2) return '2nd Place';
  if (place === 3) return '3rd Place';
  return '';
}

function placeMedalClass(place: number | null | undefined): string {
  if (place === 1) return 'gold';
  if (place === 2) return 'silver';
  if (place === 3) return 'bronze';
  return 'none';
}

function rankText(r: LeaderboardRanking): string {
  if (r.totalMembers === 0) return '';
  return `Rank ${r.rank} of ${r.totalMembers}`;
}

/* Collect all unique submissions from a contest result for the lightbox carousel */
function collectSubmissions(contest: MyResultsContest): SubmissionResult[] {
  const seen = new Set<number>();
  const all: SubmissionResult[] = [];
  for (const cat of [contest.themeResult, contest.favoriteResult, contest.wildcardResult]) {
    for (const sub of cat.submissions) {
      if (!seen.has(sub.submissionId)) {
        seen.add(sub.submissionId);
        all.push(sub);
      }
    }
  }
  // Sort: placed first (best place asc), then unplaced
  all.sort((a, b) => {
    const ap = a.place ?? Infinity;
    const bp = b.place ?? Infinity;
    return ap - bp;
  });
  return all;
}

/* Build a map of submissionId -> list of (place, category) for the lightbox */
function buildPlacementMap(contest: MyResultsContest): Map<number, { place: number; category: string }[]> {
  const map = new Map<number, { place: number; category: string }[]>();
  const categories: [CategoryResult, VoteCategory][] = [
    [contest.themeResult, 'theme'],
    [contest.favoriteResult, 'favorite'],
    [contest.wildcardResult, 'wildcard'],
  ];
  for (const [catResult, catName] of categories) {
    for (const sub of catResult.submissions) {
      if (sub.place != null) {
        const arr = map.get(sub.submissionId) || [];
        arr.push({ place: sub.place, category: catName });
        map.set(sub.submissionId, arr);
      }
    }
  }
  return map;
}

/* ── Lightbox ────────────────────────────────── */

interface LightboxState {
  contest: MyResultsContest;
  submissions: SubmissionResult[];
  index: number;
  placementMap: Map<number, { place: number; category: string }[]>;
}

function SubmissionLightbox({
  state,
  onClose,
  onNav,
}: {
  state: LightboxState;
  onClose: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  const { submissions, index, contest, placementMap } = state;
  const sub = submissions[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const { loaded, errored, handleLoad, handleError, imgRef } = useImageLoaded(getImageUrl(sub.url, 'full'));
  const exifText = formatExif(sub.exif);
  const placements = placementMap.get(sub.submissionId) || [];

  const startClose = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setClosing(true);
    }
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose();
      if (e.key === 'ArrowLeft' && submissions.length > 1) onNav(-1);
      if (e.key === 'ArrowRight' && submissions.length > 1) onNav(1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startClose, onNav, submissions.length]);

  return (
    <div
      className={`my-results__lightbox-backdrop${closing ? ' my-results__lightbox-backdrop--closing' : ''}`}
      onClick={startClose}
      onAnimationEnd={() => { if (closing) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Submission detail"
    >
      <div className="my-results__lightbox" onClick={e => e.stopPropagation()}>
        <button ref={closeRef} className="my-results__lightbox-close" onClick={startClose} aria-label="Close">
          <X size={24} />
        </button>

        {submissions.length > 1 && (
          <span className="my-results__lightbox-counter">
            {index + 1} / {submissions.length}
          </span>
        )}

        <div className={`my-results__lightbox-header${loaded ? ' my-results__lightbox-header--loaded' : ''}`}>
          <h2 className="my-results__lightbox-title">{sub.title}</h2>
          {placements.length > 0 ? (
            <div className="my-results__lightbox-placements">
              {placements
                .sort((a, b) => a.place - b.place)
                .map((p, i) => (
                  <span
                    key={i}
                    className={`my-results__lightbox-placement-badge my-results__lightbox-placement-badge--${placeMedalClass(p.place)}`}
                  >
                    <Trophy size={12} aria-hidden="true" />
                    <span className="my-results__lightbox-placement-text">
                      {placeLabel(p.place)}
                      <span className="my-results__lightbox-placement-sep" aria-hidden="true"> &middot; </span>
                      {getCategoryLabel(p.category as VoteCategory, contest.wildcardCategory)}
                    </span>
                  </span>
                ))}
            </div>
          ) : (
            <div className="my-results__lightbox-placements">
              <span className="my-results__lightbox-placement-badge my-results__lightbox-placement-badge--none">
                No placement
              </span>
            </div>
          )}
          <div className="my-results__lightbox-meta">
            <span className="my-results__lightbox-meta-author">by {sub.photographer}</span>
            <span className="my-results__lightbox-meta-sep" aria-hidden="true">&middot;</span>
            <span className="my-results__lightbox-meta-contest">
              {formatMonth(contest.month)} &mdash; {contest.theme}
            </span>
          </div>
        </div>

        <div className="my-results__lightbox-body">
          {!loaded && (
            <div className="my-results__lightbox-loading">
              <div className="section-spinner__ring" />
            </div>
          )}
          {errored ? (
            <div className="img-error-fallback my-results__lightbox-img my-results__lightbox-img--loaded" style={{ minHeight: 200, minWidth: 300 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48 }}>
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
                <path d="M21 15V6a2 2 0 0 0-2-2H9" />
                <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
              </svg>
            </div>
          ) : (
            <img
              ref={imgRef}
              key={sub.url}
              className={`my-results__lightbox-img${loaded ? ' my-results__lightbox-img--loaded' : ''}`}
              src={getImageUrl(sub.url, 'full')}
              alt={sub.title}
              onLoad={handleLoad}
              onError={handleError}
            />
          )}
        </div>

        <span className={`my-results__lightbox-exif${loaded ? ' my-results__lightbox-exif--loaded' : ''}${exifText ? '' : ' my-results__lightbox-exif--empty'}`}>
          {exifText || '\u00a0'}
        </span>

        {submissions.length > 1 && (
          <>
            <button className="my-results__lightbox-arrow my-results__lightbox-arrow--prev" onClick={() => onNav(-1)} aria-label="Previous submission">
              &#8249;
            </button>
            <button className="my-results__lightbox-arrow my-results__lightbox-arrow--next" onClick={() => onNav(1)} aria-label="Next submission">
              &#8250;
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Grid Cell ───────────────────────────────── */

function GridCell({
  result,
  thumbUrl,
  onClick,
}: {
  result: CategoryResult;
  thumbUrl: string | null;
  onClick: (() => void) | null;
}) {
  const place = result.bestPlace;
  const isGray = !result.hasSubmission;
  const clickable = !isGray && onClick !== null;

  let cellClass = 'my-results__cell';
  if (isGray) {
    cellClass += ' my-results__cell--gray';
  } else if (place === 1) {
    cellClass += ' my-results__cell--gold my-results__cell--clickable';
  } else if (place === 2) {
    cellClass += ' my-results__cell--silver my-results__cell--clickable';
  } else if (place === 3) {
    cellClass += ' my-results__cell--bronze my-results__cell--clickable';
  } else {
    cellClass += ' my-results__cell--white my-results__cell--clickable';
  }

  const style: React.CSSProperties = {};
  if (thumbUrl && !isGray) {
    style.backgroundImage = `url("${thumbUrl}")`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (clickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick!();
    }
  };

  return (
    <div
      className={cellClass}
      style={style}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      aria-disabled={isGray ? true : undefined}
      onClick={clickable ? onClick! : undefined}
      onKeyDown={clickable ? handleKeyDown : undefined}
      aria-label={
        isGray
          ? 'No submission'
          : place
            ? `${placeLabel(place)} finish`
            : 'Submitted, no placement'
      }
    >
      {place != null && (
        <span className={`my-results__cell-badge my-results__cell-badge--${placeMedalClass(place)}`}>
          {place}
        </span>
      )}
    </div>
  );
}

/* ── Stat Card ───────────────────────────────── */

function StatCard({
  icon,
  value,
  label,
  rank,
  variant,
  extra,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  rank?: string;
  variant?: 'gold' | 'silver' | 'bronze' | 'secondary';
  extra?: React.ReactNode;
}) {
  let cls = 'my-results__stat-card';
  if (variant === 'gold') cls += ' my-results__stat-card--gold';
  else if (variant === 'silver') cls += ' my-results__stat-card--silver';
  else if (variant === 'bronze') cls += ' my-results__stat-card--bronze';
  else if (variant === 'secondary') cls += ' my-results__stat-card--secondary';

  return (
    <div className={cls}>
      <div className="my-results__stat-icon">{icon}</div>
      <span className="my-results__stat-value">{value}</span>
      <span className="my-results__stat-label">{label}</span>
      {rank && <span className="my-results__stat-rank">{rank}</span>}
      {extra}
    </div>
  );
}

/* ── Main Page ───────────────────────────────── */

export default function MyResultsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<MyResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Grid scroll state
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch data
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      let cancelled = false;
      getMyResults()
        .then(d => { if (!cancelled) { setData(d); setError(false); } })
        .catch(() => { if (!cancelled) setError(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
  }, [authLoading, isAuthenticated]);

  // Scroll arrow visibility
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 1);
      setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, [data]);

  const handleGridScroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 72 * 4, behavior: 'smooth' });
  };

  const openLightbox = (contest: MyResultsContest) => {
    const subs = collectSubmissions(contest);
    if (subs.length === 0) return;
    setLightbox({
      contest,
      submissions: subs,
      index: 0,
      placementMap: buildPlacementMap(contest),
    });
  };

  const navigateLightbox = useCallback((dir: -1 | 1) => {
    setLightbox(prev => {
      if (!prev) return prev;
      const len = prev.submissions.length;
      const next = (prev.index + dir + len) % len;
      return { ...prev, index: next };
    });
  }, []);

  if (authLoading) return null;

  const s = data?.stats;
  const lb = data?.leaderboard;

  /* Get the thumbnail URL for a cell (best-placed or first submission) */
  function cellThumb(cat: CategoryResult): string | null {
    if (!cat.hasSubmission || cat.submissions.length === 0) return null;
    // If placed, show the placed submission; otherwise first submission
    const placed = cat.submissions.find(sub => sub.place != null);
    const target = placed || cat.submissions[0];
    return getImageUrl(target.url, 'thumb');
  }

  function bestCategoryDisplay(cat: string | null | undefined): string {
    if (!cat) return '\u2014';
    return getCategoryLabel(cat as VoteCategory);
  }

  return (
    <div className="my-results">
      {/* Hero */}
      <section className="my-results__hero">
        <div className="my-results__hero-content">
          <h1>My Results</h1>
          <p>Your competition performance and submission history</p>
        </div>
      </section>

      <div className="my-results__container">
        {/* Loading */}
        {loading && (
          <div className="my-results__loading">
            <div className="section-spinner__ring" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="my-results__error">
            <p>Something went wrong loading your results.</p>
            <button onClick={() => {
              setLoading(true);
              setError(false);
              getMyResults()
                .then(d => { setData(d); setError(false); })
                .catch(() => setError(true))
                .finally(() => setLoading(false));
            }}>
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data && data.contests.length === 0 && (
          <div className="my-results__empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <h2>No contest results yet</h2>
            <p>Enter a competition and check back once results are announced!</p>
            <Link to="/contest">View Contests</Link>
          </div>
        )}

        {/* Main content */}
        {!loading && !error && data && s && lb && data.contests.length > 0 && (
          <>
            {/* Stats Panel */}
            <h2 className="my-results__section-title">Performance Overview</h2>

            <div className="my-results__podium-row">
              <StatCard
                icon={<Trophy size={32} />}
                value={s.firstPlaceFinishes}
                label="1st Place"
                rank={rankText(lb.firstPlace)}
                variant="gold"
              />
              <StatCard
                icon={<Trophy size={32} />}
                value={s.secondPlaceFinishes}
                label="2nd Place"
                rank={rankText(lb.secondPlace)}
                variant="silver"
              />
              <StatCard
                icon={<Trophy size={32} />}
                value={s.thirdPlaceFinishes}
                label="3rd Place"
                rank={rankText(lb.thirdPlace)}
                variant="bronze"
              />
            </div>

            <div className="my-results__secondary-row">
              <StatCard
                icon={<TrendingUp size={24} />}
                value={s.totalVotes}
                label="Votes Earned"
                rank={rankText(lb.totalVotes)}
                variant="secondary"
              />
              <StatCard
                icon={<Award size={24} />}
                value={s.podiumFinishes}
                label="Podium Finishes"
                rank={rankText(lb.totalPodium)}
                variant="secondary"
              />
              <StatCard
                icon={<Calendar size={24} />}
                value={`${s.contestsEntered} / ${s.totalCompletedContests}`}
                label="Contests Entered"
                rank={`${Math.round(s.participationRate * 100)}% participation`}
                variant="secondary"
              />
              <StatCard
                icon={<Star size={24} />}
                value={bestCategoryDisplay(s.bestCategory)}
                label="Best Category"
                variant="secondary"
                extra={
                  s.bestCategory ? (
                    <span className="my-results__best-cat">Most wins</span>
                  ) : null
                }
              />
            </div>

            {/* Competition History Grid */}
            <div className="my-results__grid-wrapper">
              <h2 className="my-results__section-title">Competition History</h2>

              <div className="my-results__grid">
                {/* Fixed label column */}
                <div className="my-results__grid-labels">
                  <div className="my-results__grid-label-header" />
                  <div className="my-results__grid-label">Theme</div>
                  <div className="my-results__grid-label">Favorite</div>
                  <div className="my-results__grid-label">Bonus Challenge</div>
                </div>

                {/* Scrollable area */}
                <div className="my-results__grid-scroll" ref={scrollRef}>
                  <div className="my-results__grid-content">
                    {/* Column headers */}
                    <div className="my-results__grid-header-row">
                      {data.contests.map(c => (
                        <div key={c.contestId} className="my-results__grid-header-cell">
                          {formatMonth(c.month)}
                        </div>
                      ))}
                    </div>

                    {/* Theme row */}
                    <div className="my-results__grid-row">
                      {data.contests.map(c => (
                        <GridCell
                          key={c.contestId}
                          result={c.themeResult}
                          thumbUrl={cellThumb(c.themeResult)}
                          onClick={c.themeResult.hasSubmission ? () => openLightbox(c) : null}
                        />
                      ))}
                    </div>

                    {/* Favorite row */}
                    <div className="my-results__grid-row">
                      {data.contests.map(c => (
                        <GridCell
                          key={c.contestId}
                          result={c.favoriteResult}
                          thumbUrl={cellThumb(c.favoriteResult)}
                          onClick={c.favoriteResult.hasSubmission ? () => openLightbox(c) : null}
                        />
                      ))}
                    </div>

                    {/* Wildcard row */}
                    <div className="my-results__grid-row">
                      {data.contests.map(c => (
                        <GridCell
                          key={c.contestId}
                          result={c.wildcardResult}
                          thumbUrl={cellThumb(c.wildcardResult)}
                          onClick={c.wildcardResult.hasSubmission ? () => openLightbox(c) : null}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Scroll arrows */}
                <button
                  className={`my-results__grid-arrow my-results__grid-arrow--left${!canScrollLeft ? ' my-results__grid-arrow--hidden' : ''}`}
                  onClick={() => handleGridScroll(-1)}
                  aria-label="Scroll left"
                >
                  &#8249;
                </button>
                <button
                  className={`my-results__grid-arrow my-results__grid-arrow--right${!canScrollRight ? ' my-results__grid-arrow--hidden' : ''}`}
                  onClick={() => handleGridScroll(1)}
                  aria-label="Scroll right"
                >
                  &#8250;
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <SubmissionLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
          onNav={navigateLightbox}
        />
      )}
    </div>
  );
}
