import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Camera, Users, ChevronDown, Trophy, Award } from 'lucide-react';
import type { Contest, ContestSubmission } from '../types/contest';
import { useImageLoaded } from '../hooks/useImageLoaded';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Footer from '../components/Footer';
import './ContestPage.css';

const PAGE_SIZE = 12;
const CROSSFADE_MS = 300;

function formatExif(sub: ContestSubmission): string | null {
  if (!sub.exif) return null;
  const parts: string[] = [];
  if (sub.exif.camera) parts.push(sub.exif.camera);
  if (sub.exif.focalLength) parts.push(sub.exif.focalLength);
  if (sub.exif.aperture) parts.push(sub.exif.aperture);
  if (sub.exif.shutterSpeed) parts.push(sub.exif.shutterSpeed);
  if (sub.exif.iso != null) parts.push(`ISO ${sub.exif.iso}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function formatDeadline(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ─── Submission Grid Item ─── */

function SubmissionItem({
  submission,
  contest,
  onClick,
}: {
  submission: ContestSubmission;
  contest: Contest;
  onClick: () => void;
}) {
  const { loaded, errored, handleLoad, handleError } = useImageLoaded(`${submission.url}/600/400`);

  const winnerPlace = contest.winners?.find((w) => w.submissionId === submission.id)?.place;

  return (
    <div
      className={`contest__grid-item${!loaded ? ' shimmer-bg' : ''}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      role="button"
      aria-label={`View ${submission.title} by ${submission.photographer}`}
    >
      {errored ? (
        <div className="img-error-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
            <path d="M21 15V6a2 2 0 0 0-2-2H9" />
            <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
          </svg>
        </div>
      ) : (
        <img
          src={`${submission.url}/600/400`}
          alt={submission.title}
          loading="lazy"
          className={`img-fade${loaded ? ' img-fade--loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      <div className="contest__grid-overlay">
        <h3>{submission.title}</h3>
        <p>{submission.photographer}</p>
        {(contest.status === 'voting' || contest.status === 'completed') && submission.votes != null && (
          <span className="contest__vote-count">{submission.votes} votes</span>
        )}
      </div>
      {winnerPlace && (
        <div className={`contest__winner-badge contest__winner-badge--${winnerPlace}`}>
          <Trophy size={14} />
          <span>{winnerPlace === 1 ? '1st' : winnerPlace === 2 ? '2nd' : '3rd'}</span>
        </div>
      )}
    </div>
  );
}

/* ─── Lightbox ─── */

function ContestLightbox({
  submissions,
  contest,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  submissions: ContestSubmission[];
  contest: Contest;
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const sub = submissions[index];
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const startClose = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setIsClosing(true);
    }
  };

  const { loaded, errored, handleLoad, handleError } = useImageLoaded(`${sub.url}/1200/800`);

  const [prevSub, setPrevSub] = useState<ContestSubmission | null>(null);
  const prevIndexRef = useRef(index);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fadeIn, setFadeIn] = useState(false);
  const fadeUrlRef = useRef('');

  const currentUrl = `${sub.url}/1200/800`;
  if (fadeUrlRef.current !== currentUrl) {
    fadeUrlRef.current = currentUrl;
    if (fadeIn) setFadeIn(false);
  }

  useEffect(() => {
    if (prevIndexRef.current !== index) {
      if (!prevSub) {
        setPrevSub(submissions[prevIndexRef.current]);
      }
      prevIndexRef.current = index;
    }
  }, [index, submissions, prevSub]);

  useEffect(() => {
    if (fadeIn && prevSub) {
      fadeTimerRef.current = setTimeout(() => setPrevSub(null), CROSSFADE_MS);
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [fadeIn, prevSub]);

  const handleLightboxLoad = useCallback(() => {
    handleLoad();
    requestAnimationFrame(() => setFadeIn(true));
  }, [handleLoad]);

  const handleLightboxError = useCallback(() => {
    handleError();
    requestAnimationFrame(() => setFadeIn(true));
  }, [handleError]);

  const displaySub = (prevSub && !loaded) ? prevSub : sub;
  const exifText = formatExif(displaySub);
  const winnerPlace = contest.winners?.find((w) => w.submissionId === displaySub.id)?.place;

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
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPrev, onNext]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"]), a[href]'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div
      className={`contest__lightbox-backdrop${isClosing ? ' contest__lightbox-backdrop--closing' : ''}`}
      onClick={startClose}
      onAnimationEnd={() => { if (isClosing) { setIsClosing(false); onClose(); } }}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${sub.title} by ${sub.photographer}`}
    >
      <div className="contest__lightbox" onClick={(e) => e.stopPropagation()}>
        <button
          className="contest__lightbox-close"
          onClick={startClose}
          aria-label="Close lightbox"
          ref={closeRef}
        >
          &times;
        </button>
        <span className="contest__lightbox-counter">
          {index + 1} / {submissions.length}
        </span>

        <div className={`contest__lightbox-header${fadeIn ? ' contest__lightbox-header--loaded' : ''}`}>
          <div className="contest__lightbox-header-top">
            <strong>{displaySub.title}</strong>
            {winnerPlace && (
              <span className={`contest__lightbox-badge contest__lightbox-badge--${winnerPlace}`}>
                <Trophy size={14} />
                {winnerPlace === 1 ? '1st Place' : winnerPlace === 2 ? '2nd Place' : '3rd Place'}
              </span>
            )}
          </div>
          <span>{displaySub.photographer}</span>
          {(contest.status === 'voting' || contest.status === 'completed') && displaySub.votes != null && (
            <span className="contest__lightbox-votes">{displaySub.votes} votes</span>
          )}
        </div>

        <div className="contest__lightbox-body">
          {!loaded && !prevSub && (
            <div className="contest__lightbox-loading">
              <div className="section-spinner__ring" />
            </div>
          )}

          {prevSub && (
            <img
              className={`contest__lightbox-img contest__lightbox-img--prev${
                fadeIn ? ' contest__lightbox-img--fade-out' : ''
              }`}
              src={`${prevSub.url}/1200/800`}
              alt=""
            />
          )}

          {errored && !prevSub ? (
            <div className="img-error-fallback contest__lightbox-img contest__lightbox-img--loaded" style={{ minHeight: 200, minWidth: 300 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48 }}>
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
                <path d="M21 15V6a2 2 0 0 0-2-2H9" />
                <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
              </svg>
            </div>
          ) : (
            <img
              key={sub.url}
              className={`contest__lightbox-img${fadeIn ? ' contest__lightbox-img--loaded' : ''}`}
              src={`${sub.url}/1200/800`}
              alt={sub.title}
              onLoad={handleLightboxLoad}
              onError={handleLightboxError}
            />
          )}
        </div>

        <span className={`contest__lightbox-exif${fadeIn ? ' contest__lightbox-exif--loaded' : ''}${exifText ? '' : ' contest__lightbox-exif--empty'}`}>
          {exifText || '\u00a0'}
        </span>

        <button
          className="contest__lightbox-arrow contest__lightbox-arrow--prev"
          onClick={onPrev}
          aria-label="Previous image"
        >
          &#8249;
        </button>
        <button
          className="contest__lightbox-arrow contest__lightbox-arrow--next"
          onClick={onNext}
          aria-label="Next image"
        >
          &#8250;
        </button>
      </div>
    </div>
  );
}

/* ─── Main Contest Page ─── */

export default function ContestPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeContestIndex, setActiveContestIndex] = useState(0);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  // Tab animation
  const [tabAnimPhase, setTabAnimPhase] = useState<'exit' | 'enter' | null>(null);
  const [pendingTab, setPendingTab] = useState<number | null>(null);
  const [tabVersion, setTabVersion] = useState(0);

  // Grid pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  // Lightbox
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    import('../data/contests.json')
      .then((mod) => {
        const data = (mod.default ?? mod) as Contest[];
        setContests(data);
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

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useScrollReveal();

  const contest = contests[activeContestIndex];
  const submissions = contest?.submissions ?? [];

  // Sort submissions: for completed/voting, sort by votes desc; for active, by id
  const sortedSubmissions = useMemo(() => {
    if (!contest) return [];
    if (contest.status === 'active') return [...submissions];
    return [...submissions].sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  }, [contest, submissions]);

  const totalPages = Math.ceil(sortedSubmissions.length / PAGE_SIZE);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;
  const displayedSubmissions = sortedSubmissions.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const handleTabChange = (idx: number) => {
    if (idx === activeContestIndex || tabAnimPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setActiveContestIndex(idx);
      setCurrentPage(0);
      setSlideDir(null);
      setTabVersion((v) => v + 1);
      setGuidelinesOpen(false);
      return;
    }
    setPendingTab(idx);
    setTabAnimPhase('exit');
  };

  const goToNextPage = useCallback(() => {
    if (!hasNext || isPageTransitioning) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSlideDir('left');
      setCurrentPage((p) => p + 1);
    } else {
      setSlideDir('left');
      setPendingPage(currentPage + 1);
      setIsPageTransitioning(true);
    }
  }, [hasNext, isPageTransitioning, currentPage]);

  const goToPrevPage = useCallback(() => {
    if (!hasPrev || isPageTransitioning) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSlideDir('right');
      setCurrentPage((p) => p - 1);
    } else {
      setSlideDir('right');
      setPendingPage(currentPage - 1);
      setIsPageTransitioning(true);
    }
  }, [hasPrev, isPageTransitioning, currentPage]);

  const goToPrevPhoto = useCallback(() => {
    setSelectedIndex((i) =>
      i === null ? null : i === 0 ? sortedSubmissions.length - 1 : i - 1
    );
  }, [sortedSubmissions.length]);

  const goToNextPhoto = useCallback(() => {
    setSelectedIndex((i) =>
      i === null ? null : i === sortedSubmissions.length - 1 ? 0 : i + 1
    );
  }, [sortedSubmissions.length]);

  const handleClose = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev !== null) {
        setCurrentPage(Math.floor(prev / PAGE_SIZE));
      }
      return null;
    });
  }, []);

  const handleItemClick = (localIndex: number) => {
    setSelectedIndex(currentPage * PAGE_SIZE + localIndex);
  };

  const gridClassName = [
    'contest__grid',
    isPageTransitioning && slideDir === 'left' && 'contest__grid--exit-left',
    isPageTransitioning && slideDir === 'right' && 'contest__grid--exit-right',
    !isPageTransitioning && slideDir === 'left' && 'contest__grid--slide-from-right',
    !isPageTransitioning && slideDir === 'right' && 'contest__grid--slide-from-left',
  ]
    .filter(Boolean)
    .join(' ');

  const statusLabel =
    contest?.status === 'active'
      ? 'Open for Submissions'
      : contest?.status === 'voting'
        ? 'Voting in Progress'
        : 'Completed';

  const activeContest = contests.find((c) => c.status === 'active') ?? contests[0];

  // Get winner submissions for podium
  const winnerSubmissions = useMemo(() => {
    if (!contest || contest.status !== 'completed' || !contest.winners) return [];
    return contest.winners
      .sort((a, b) => a.place - b.place)
      .map((w) => ({
        ...w,
        submission: contest.submissions.find((s) => s.id === w.submissionId)!,
      }))
      .filter((w) => w.submission);
  }, [contest]);

  if (loading) {
    return (
      <div className="contest-page">
        <div className="contest-page__loading">
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !contest) {
    return (
      <div className="contest-page">
        <div className="contest-page__error">
          <div className="section-error">
            <p>Something went wrong loading contests.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="contest-page">
      {/* ── Hero Banner ── */}
      <div className="contest-page__hero">
        <div className="contest-page__hero-bg">
          <img
            src={`${activeContest?.submissions[0]?.url ?? 'https://picsum.photos/seed/contest-hero'}/1600/600`}
            alt=""
            aria-hidden="true"
          />
        </div>
        <div className="contest-page__hero-content container">
          <span className="contest-page__hero-badge">Monthly Photo Contest</span>
          <h1>{activeContest?.theme ?? 'Photo Contest'}</h1>
          <p>{activeContest?.description ?? ''}</p>
        </div>
      </div>

      <div className="container">
        {/* ── Contest Tabs ── */}
        <div className="contest__tabs fade-in-up delay-1" role="group" aria-label="Select contest month">
          {contests.map((c, i) => (
            <button
              key={c.id}
              className={`contest__tab${activeContestIndex === i ? ' contest__tab--active' : ''}`}
              onClick={() => handleTabChange(i)}
            >
              {c.month.split(' ')[0].slice(0, 3)}: {c.theme}
            </button>
          ))}
        </div>

        {/* ── Animated Content ── */}
        <div
          className={[
            'contest__content',
            tabAnimPhase === 'exit' && 'contest__content--filter-exit',
            tabAnimPhase === 'enter' && 'contest__content--filter-enter',
          ].filter(Boolean).join(' ')}
          key={tabVersion}
          onAnimationEnd={(e) => {
            if (e.target !== e.currentTarget) return;
            if (tabAnimPhase === 'exit') {
              setActiveContestIndex(pendingTab!);
              setCurrentPage(0);
              setSlideDir(null);
              setGuidelinesOpen(false);
              setTabVersion((v) => v + 1);
              setTabAnimPhase('enter');
            } else if (tabAnimPhase === 'enter') {
              setTabAnimPhase(null);
            }
          }}
        >
          {/* ── Challenge Details Card ── */}
          <div className="contest__details fade-in-up">
            <div className="contest__details-header">
              <span className={`contest__status contest__status--${contest.status}`}>
                {statusLabel}
              </span>
              <h2>{contest.theme}</h2>
              <p className="contest__details-month">{contest.month}</p>
              <p className="contest__details-desc">{contest.description}</p>
            </div>

            <div className="contest__details-stats">
              <div className="contest__stat">
                <Camera size={18} />
                <span>{contest.submissionCount} submissions</span>
              </div>
              <div className="contest__stat">
                <Users size={18} />
                <span>{contest.participantCount} participants</span>
              </div>
              <div className="contest__stat">
                <span className="contest__stat-date">
                  {contest.status === 'completed' ? 'Completed' : `Deadline: ${formatDeadline(contest.deadline)}`}
                </span>
              </div>
            </div>

            <div className="contest__guidelines">
              <button
                className={`contest__guidelines-toggle${guidelinesOpen ? ' contest__guidelines-toggle--open' : ''}`}
                onClick={() => setGuidelinesOpen(!guidelinesOpen)}
              >
                Submission Guidelines
                <ChevronDown size={18} />
              </button>
              <div className={`contest__guidelines-content${guidelinesOpen ? ' contest__guidelines-content--open' : ''}`}>
                <ul>
                  {contest.guidelines.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Winners Podium ── */}
          {contest.status === 'completed' && winnerSubmissions.length > 0 && (
            <div className="contest__podium fade-in-up">
              <h3 className="contest__podium-title">
                <Trophy size={22} /> Winners
              </h3>
              <div className="contest__podium-row">
                {winnerSubmissions.map(({ submission, place }) => (
                  <div
                    key={submission.id}
                    className="contest__podium-card"
                    onClick={() => {
                      const idx = sortedSubmissions.findIndex((s) => s.id === submission.id);
                      if (idx !== -1) setSelectedIndex(idx);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const idx = sortedSubmissions.findIndex((s) => s.id === submission.id);
                        if (idx !== -1) setSelectedIndex(idx);
                      }
                    }}
                  >
                    <div className={`contest__podium-badge contest__podium-badge--${place}`}>
                      {place === 1 ? '1st' : place === 2 ? '2nd' : '3rd'}
                    </div>
                    <div className="contest__podium-img">
                      <img src={`${submission.url}/300/200`} alt={submission.title} />
                    </div>
                    <p className="contest__podium-name">{submission.photographer}</p>
                    <p className="contest__podium-photo-title">{submission.title}</p>
                    {submission.votes != null && (
                      <span className="contest__podium-votes">{submission.votes} votes</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Honorable Mentions */}
              {contest.honorableMentions && contest.honorableMentions.length > 0 && (
                <div className="contest__honorable">
                  <h4>
                    <Award size={16} /> Honorable Mentions
                  </h4>
                  <div className="contest__honorable-list">
                    {contest.honorableMentions.map((hm) => {
                      const s = contest.submissions.find((sub) => sub.id === hm.submissionId);
                      if (!s) return null;
                      return (
                        <span key={s.id} className="contest__honorable-name">
                          {s.photographer} — <em>{s.title}</em>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {contest.status === 'voting' && (
            <div className="contest__voting-notice fade-in-up">
              <p>Voting closes {formatDeadline(contest.deadline)}. Browse submissions below and vote for your favorites!</p>
            </div>
          )}

          {/* ── Submissions Grid ── */}
          <div className="contest__submissions fade-in-up">
            <h3 className="contest__submissions-title">
              Submissions ({sortedSubmissions.length})
            </h3>

            <div className="contest__carousel">
              {hasPrev && (
                <button
                  className="contest__nav contest__nav--prev"
                  onClick={goToPrevPage}
                  aria-label="Previous page"
                >
                  &#8249;
                </button>
              )}

              <div
                className={gridClassName}
                key={currentPage}
                onAnimationEnd={() => {
                  if (isPageTransitioning && pendingPage !== null) {
                    setCurrentPage(pendingPage);
                    setIsPageTransitioning(false);
                    setPendingPage(null);
                  } else {
                    setSlideDir(null);
                  }
                }}
              >
                {displayedSubmissions.map((sub, i) => (
                  <SubmissionItem
                    key={sub.id}
                    submission={sub}
                    contest={contest}
                    onClick={() => handleItemClick(i)}
                  />
                ))}
                {totalPages > 1 &&
                  Array.from({ length: PAGE_SIZE - displayedSubmissions.length }, (_, i) => (
                    <div key={`placeholder-${i}`} className="contest__grid-item contest__grid-item--placeholder" aria-hidden="true" />
                  ))}
              </div>

              {hasNext && (
                <button
                  className="contest__nav contest__nav--next"
                  onClick={goToNextPage}
                  aria-label="Next page"
                >
                  &#8250;
                </button>
              )}

              {totalPages > 1 && (
                <p className="contest__page-indicator">
                  Page {currentPage + 1} of {totalPages}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* ── Lightbox ── */}
      {selectedIndex !== null && (
        <ContestLightbox
          submissions={sortedSubmissions}
          contest={contest}
          index={selectedIndex}
          onClose={handleClose}
          onPrev={goToPrevPhoto}
          onNext={goToNextPhoto}
        />
      )}
    </div>
  );
}
