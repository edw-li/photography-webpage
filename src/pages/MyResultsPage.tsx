import { Fragment, useEffect, useId, useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getMyResults } from '../api/contests';
import { formatPoints, getCategoryLabel, isPointsContest, tiebreakLabel } from '../types/contest';
import type {
  MyResultsResponse,
  MyResultsContest,
  MyResultsStats,
  MyResultsLeaderboard,
  CategoryResult,
  SubmissionResult,
  LeaderboardRanking,
  PlacementCategory,
  PointsScore,
  VoteCategory,
} from '../types/contest';
import type { PhotoExif } from '../types/gallery';
import { getImageUrl } from '../utils/imageUrl';
import { useImageLoaded } from '../hooks/useImageLoaded';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { Trophy, Award, TrendingUp, Calendar, Star, Sparkles, Crown, X } from 'lucide-react';
import './MyResultsPage.css';

/* ── Helpers ─────────────────────────────────── */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Split a "YYYY-MM" contest month; null when it isn't in that shape. */
function parseMonth(month: string): { year: string; monthIndex: number } | null {
  const [year, m] = month.split('-');
  const mi = parseInt(m, 10);
  if (!year || isNaN(mi) || mi < 1 || mi > 12) return null;
  return { year, monthIndex: mi - 1 };
}

/** "2026-03" -> "Mar '26" (grid column headers). */
function formatMonth(month: string): string {
  const p = parseMonth(month);
  return p ? `${SHORT_MONTHS[p.monthIndex]} '${p.year.slice(2)}` : month;
}

/** "2026-03" -> "March 2026" (screen-reader labels for grid cells). */
function formatMonthLong(month: string): string {
  const p = parseMonth(month);
  return p ? `${LONG_MONTHS[p.monthIndex]} ${p.year}` : month;
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

type MedalPlace = 1 | 2 | 3;

/** Only podium places (1-3) earn a medal; a rank below 3rd is never shown. */
function medalPlace(place: number | null | undefined): MedalPlace | null {
  return place === 1 || place === 2 || place === 3 ? place : null;
}

function placeLabel(place: MedalPlace): string {
  if (place === 1) return '1st Place';
  if (place === 2) return '2nd Place';
  return '3rd Place';
}

function placeMedalClass(place: MedalPlace | null): string {
  if (place === 1) return 'gold';
  if (place === 2) return 'silver';
  if (place === 3) return 'bronze';
  return 'none';
}

function rankText(r: LeaderboardRanking | null | undefined): string {
  if (!r || r.totalMembers === 0) return '';
  return `Rank ${r.rank} of ${r.totalMembers}`;
}

/** "24 points" / "1 point" for screen-reader labels, which read the
    abbreviated "pts" from formatPoints letter by letter. */
function pointsPhrase(n: number): string {
  return `${n} ${n === 1 ? 'point' : 'points'}`;
}

/** Spoken status of a history cell, e.g. "1st Place finish". */
function cellStatus(submitted: boolean, place: number | null | undefined): string {
  if (!submitted) return 'No submission';
  const medal = medalPlace(place);
  return medal ? `${placeLabel(medal)} finish` : 'Submitted, no placement';
}

function bestCategoryLabel(cat: string | null | undefined): string {
  if (!cat) return '\u2014';
  return getCategoryLabel(cat as PlacementCategory) || cat;
}

/** Keyboard activation for div[role=button] cells. */
function activateOnKey(action: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}

/* ── Classic contest data ────────────────────── */

const EMPTY_CATEGORY: CategoryResult = { hasSubmission: false, bestPlace: null, submissions: [] };

/** A classic contest's three category results; a missing one reads as "no submission". */
function classicCategories(contest: MyResultsContest): [VoteCategory, CategoryResult][] {
  return [
    ['theme', contest.themeResult ?? EMPTY_CATEGORY],
    ['favorite', contest.favoriteResult ?? EMPTY_CATEGORY],
    ['wildcard', contest.wildcardResult ?? EMPTY_CATEGORY],
  ];
}

/* Collect all unique submissions from a classic contest for the lightbox carousel */
function collectSubmissions(contest: MyResultsContest): SubmissionResult[] {
  const seen = new Set<number>();
  const all: SubmissionResult[] = [];
  for (const [, cat] of classicCategories(contest)) {
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

interface ClassicPlacement {
  place: MedalPlace;
  category: VoteCategory;
}

/* Build a map of submissionId -> list of (place, category) for the lightbox */
function buildPlacementMap(contest: MyResultsContest): Map<number, ClassicPlacement[]> {
  const map = new Map<number, ClassicPlacement[]>();
  for (const [category, result] of classicCategories(contest)) {
    for (const sub of result.submissions) {
      const place = medalPlace(sub.place);
      if (place === null) continue;
      const arr = map.get(sub.submissionId) ?? [];
      arr.push({ place, category });
      map.set(sub.submissionId, arr);
    }
  }
  return map;
}

/* Thumbnail for a classic cell: the placed submission, else the first one */
function cellThumb(cat: CategoryResult): string | null {
  if (!cat.hasSubmission || cat.submissions.length === 0) return null;
  const placed = cat.submissions.find(sub => sub.place != null);
  return getImageUrl((placed ?? cat.submissions[0]).url, 'thumb');
}

/* ── Points contest data ─────────────────────── */

interface BreakdownPart {
  label: string;
  value: number;
  /** Theme only: how often voters ranked the photo 1st / 2nd / 3rd. */
  detail?: string;
}

/** "Theme 21 (1st ×5, 2nd ×3) · Favorite 2 · Bonus 1": zero rank counts are
    left out; Bonus only appears when the contest had a Bonus Challenge. */
function scoreBreakdown(score: PointsScore, hasBonus: boolean): BreakdownPart[] {
  const rankCounts = ([
    ['1st', score.themeFirst],
    ['2nd', score.themeSecond],
    ['3rd', score.themeThird],
  ] as const)
    .filter(([, count]) => count > 0)
    .map(([rank, count]) => `${rank} \u00d7${count}`);
  const parts: BreakdownPart[] = [
    {
      label: 'Theme',
      value: score.themePoints,
      detail: rankCounts.length > 0 ? rankCounts.join(', ') : undefined,
    },
    { label: 'Favorite', value: score.favorite },
  ];
  if (hasBonus) parts.push({ label: 'Bonus', value: score.bonus });
  return parts;
}

/* ── Lightbox ────────────────────────────────── */

interface LightboxItem {
  submissionId: number;
  url: string;
  title: string;
  photographer: string;
  exif?: PhotoExif | null;
  /** Classic contests: the categories this photo placed in, best place first. */
  placements: ClassicPlacement[];
  /** Points contests: the photo's podium place (1-3), if any. */
  place?: number | null;
  /** Points contests: the photo's score. */
  score?: PointsScore | null;
}

interface LightboxState {
  contest: MyResultsContest;
  items: LightboxItem[];
  index: number;
}

/** The member's photos in one contest, in lightbox order. Points contests
    keep the API order (best first); classic contests put placed photos first. */
function buildLightboxItems(contest: MyResultsContest): LightboxItem[] {
  if (isPointsContest(contest)) {
    return (contest.overallResult?.submissions ?? []).map(sub => ({
      submissionId: sub.submissionId,
      url: sub.url,
      title: sub.title,
      photographer: sub.photographer,
      exif: sub.exif,
      placements: [],
      place: sub.place,
      score: sub.score,
    }));
  }
  const placementMap = buildPlacementMap(contest);
  return collectSubmissions(contest).map(sub => ({
    submissionId: sub.submissionId,
    url: sub.url,
    title: sub.title,
    photographer: sub.photographer,
    exif: sub.exif,
    placements: [...(placementMap.get(sub.submissionId) ?? [])].sort((a, b) => a.place - b.place),
  }));
}

function ClassicPlacementBadges({
  placements,
  wildcardLabel,
}: {
  placements: ClassicPlacement[];
  wildcardLabel?: string | null;
}) {
  if (placements.length === 0) {
    return (
      <div className="my-results__lightbox-placements">
        <span className="my-results__lightbox-placement-badge my-results__lightbox-placement-badge--none">
          No placement
        </span>
      </div>
    );
  }
  return (
    <div className="my-results__lightbox-placements">
      {placements.map(p => (
        <span
          key={p.category}
          className={`my-results__lightbox-placement-badge my-results__lightbox-placement-badge--${placeMedalClass(p.place)}`}
        >
          <Trophy size={12} aria-hidden="true" />
          <span className="my-results__lightbox-placement-text">
            {placeLabel(p.place)}
            <span className="my-results__lightbox-placement-sep" aria-hidden="true"> &middot; </span>
            {getCategoryLabel(p.category, wildcardLabel)}
          </span>
        </span>
      ))}
    </div>
  );
}

function PointsResultSummary({ item, hasBonus }: { item: LightboxItem; hasBonus: boolean }) {
  const { score } = item;
  const medal = medalPlace(item.place);

  return (
    <>
      <div className="my-results__lightbox-placements">
        {medal ? (
          <span
            className={`my-results__lightbox-placement-badge my-results__lightbox-placement-badge--${placeMedalClass(medal)}`}
          >
            <Trophy size={12} aria-hidden="true" />
            <span className="my-results__lightbox-placement-text">
              {placeLabel(medal)}
              {score && (
                <>
                  <span className="my-results__lightbox-placement-sep" aria-hidden="true"> &middot; </span>
                  {formatPoints(score.total)}
                </>
              )}
            </span>
          </span>
        ) : (
          <span className="my-results__lightbox-placement-badge my-results__lightbox-placement-badge--none">
            {score ? formatPoints(score.total) : 'No placement'}
          </span>
        )}
      </div>

      {score && (
        <div className="my-results__lightbox-score">
          <p className="my-results__lightbox-breakdown">
            {scoreBreakdown(score, hasBonus).map((part, i) => (
              <Fragment key={part.label}>
                {/* The dot sticks to the previous part, so a wrap never starts a line with it */}
                {i > 0 && (
                  <span className="my-results__lightbox-breakdown-sep" aria-hidden="true">
                    {'\u00a0\u00b7 '}
                  </span>
                )}
                <span className="my-results__lightbox-breakdown-part">
                  {part.label} <strong>{part.value}</strong>
                  {part.detail && (
                    <span className="my-results__lightbox-breakdown-detail"> ({part.detail})</span>
                  )}
                </span>
              </Fragment>
            ))}
          </p>
          {score.tiebreak && (
            <p className="my-results__lightbox-tiebreak">
              Tied on points &middot; ordered by {tiebreakLabel(score.tiebreak)}
            </p>
          )}
        </div>
      )}
    </>
  );
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
  const { items, index, contest } = state;
  const sub = items[index];
  const closeRef = useRef<HTMLButtonElement>(null);
  const [closing, setClosing] = useState(false);
  const { loaded, errored, handleLoad, handleError, imgRef } = useImageLoaded(getImageUrl(sub.url, 'full'));
  const exifText = formatExif(sub.exif);

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
      if (e.key === 'ArrowLeft' && items.length > 1) onNav(-1);
      if (e.key === 'ArrowRight' && items.length > 1) onNav(1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startClose, onNav, items.length]);

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

        {items.length > 1 && (
          <span className="my-results__lightbox-counter">
            {index + 1} / {items.length}
          </span>
        )}

        <div className={`my-results__lightbox-header${loaded ? ' my-results__lightbox-header--loaded' : ''}`}>
          <h2 className="my-results__lightbox-title">{sub.title}</h2>
          {isPointsContest(contest) ? (
            <PointsResultSummary item={sub} hasBonus={contest.hasWildcard} />
          ) : (
            <ClassicPlacementBadges placements={sub.placements} wildcardLabel={contest.wildcardCategory} />
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

        {items.length > 1 && (
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

/* ── Grid Cells ──────────────────────────────── */

/** Thumbnail cell: gray when nothing was submitted, medal border and badge
    for a podium finish, white otherwise. */
function ResultCell({
  submitted,
  place,
  thumbUrl,
  onClick,
  ariaLabel,
}: {
  submitted: boolean;
  place: number | null | undefined;
  thumbUrl: string | null;
  onClick: (() => void) | null;
  ariaLabel: string;
}) {
  const medal = medalPlace(place);
  const clickable = submitted && onClick !== null;

  let cellClass = 'my-results__cell';
  if (!submitted) {
    cellClass += ' my-results__cell--gray';
  } else {
    cellClass += medal ? ` my-results__cell--${placeMedalClass(medal)}` : ' my-results__cell--white';
    if (clickable) cellClass += ' my-results__cell--clickable';
  }

  const style: React.CSSProperties = {};
  if (thumbUrl && submitted) {
    style.backgroundImage = `url("${thumbUrl}")`;
    style.backgroundSize = 'cover';
    style.backgroundPosition = 'center';
  }

  return (
    <div
      className={cellClass}
      style={style}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : -1}
      aria-disabled={submitted ? undefined : true}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? activateOnKey(onClick) : undefined}
      aria-label={ariaLabel}
    >
      {medal != null && (
        <span className={`my-results__cell-badge my-results__cell-badge--${placeMedalClass(medal)}`}>
          {medal}
        </span>
      )}
    </div>
  );
}

/** Points leaderboard "Overall" cell: the member's best photo and its medal. */
function OverallCell({ contest, onOpen }: { contest: MyResultsContest; onOpen: (c: MyResultsContest) => void }) {
  const overall = contest.overallResult;
  const best = overall?.submissions[0];
  const submitted = best != null;
  let ariaLabel = `${formatMonthLong(contest.month)}, Overall: ${cellStatus(submitted, overall?.bestPlace)}`;
  if (overall && submitted) ariaLabel += `, best score ${pointsPhrase(overall.bestPoints)}`;

  return (
    <ResultCell
      submitted={submitted}
      place={overall?.bestPlace}
      thumbUrl={best ? getImageUrl(best.url, 'thumb') : null}
      onClick={submitted ? () => onOpen(contest) : null}
      ariaLabel={ariaLabel}
    />
  );
}

/** Points leaderboard "Best score" cell: compact text, "24 pts" — the points
    of the member's top photo in that contest (the overview card is the total). */
function BestScoreCell({ contest, onOpen }: { contest: MyResultsContest; onOpen: (c: MyResultsContest) => void }) {
  const overall = contest.overallResult;
  if (!overall || overall.submissions.length === 0) {
    return (
      <div
        className="my-results__cell my-results__cell--points my-results__cell--gray"
        aria-disabled="true"
        aria-label={`${formatMonthLong(contest.month)}, Best score: No submission`}
      />
    );
  }
  const open = () => onOpen(contest);
  return (
    <div
      className="my-results__cell my-results__cell--points"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={activateOnKey(open)}
      aria-label={`${formatMonthLong(contest.month)}, Best score: ${pointsPhrase(overall.bestPoints)}`}
    >
      {formatPoints(overall.bestPoints)}
    </div>
  );
}

/* ── History Grid ────────────────────────────── */

interface HistoryRow {
  key: string;
  label: string;
  /** Short text row (e.g. points) instead of a thumbnail row. */
  compact?: boolean;
  renderCell: (contest: MyResultsContest) => React.ReactNode;
}

/** Fixed label column plus horizontally scrolling month columns (newest
    first, as the API orders them). Each grid keeps its own scroll state. */
function HistoryGrid({
  contests,
  rows,
  label,
}: {
  contests: MyResultsContest[];
  rows: HistoryRow[];
  label: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Scroll arrow visibility. Observing the content too catches columns
  // being added or removed without the viewport itself resizing.
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
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener('scroll', check); ro.disconnect(); };
  }, []);

  const handleGridScroll = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * 72 * 4, behavior: 'smooth' });
  };

  return (
    <div className="my-results__grid" role="group" aria-label={label}>
      {/* Fixed label column */}
      <div className="my-results__grid-labels">
        <div className="my-results__grid-label-header" />
        {rows.map(row => (
          <div
            key={row.key}
            className={`my-results__grid-label${row.compact ? ' my-results__grid-label--compact' : ''}`}
          >
            {row.label}
          </div>
        ))}
      </div>

      {/* Scrollable area */}
      <div className="my-results__grid-scroll" ref={scrollRef}>
        <div className="my-results__grid-content">
          {/* Column headers */}
          <div className="my-results__grid-header-row">
            {contests.map(c => (
              <div key={c.contestId} className="my-results__grid-header-cell">
                {formatMonth(c.month)}
              </div>
            ))}
          </div>

          {rows.map(row => (
            <div key={row.key} className="my-results__grid-row">
              {contests.map(c => (
                <Fragment key={c.contestId}>{row.renderCell(c)}</Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Scroll arrows */}
      <button
        type="button"
        className={`my-results__grid-arrow my-results__grid-arrow--left${!canScrollLeft ? ' my-results__grid-arrow--hidden' : ''}`}
        onClick={() => handleGridScroll(-1)}
        aria-label="Scroll left"
      >
        &#8249;
      </button>
      <button
        type="button"
        className={`my-results__grid-arrow my-results__grid-arrow--right${!canScrollRight ? ' my-results__grid-arrow--hidden' : ''}`}
        onClick={() => handleGridScroll(1)}
        aria-label="Scroll right"
      >
        &#8250;
      </button>
    </div>
  );
}

/* ── Competition History sections ────────────── */

function PointsHistory({
  contests,
  onOpen,
}: {
  contests: MyResultsContest[];
  onOpen: (c: MyResultsContest) => void;
}) {
  const headingId = useId();
  const rows: HistoryRow[] = [
    { key: 'overall', label: 'Overall', renderCell: c => <OverallCell contest={c} onOpen={onOpen} /> },
    { key: 'best-score', label: 'Best score', compact: true, renderCell: c => <BestScoreCell contest={c} onOpen={onOpen} /> },
  ];

  return (
    <section className="my-results__history-section fade-in-up" aria-labelledby={headingId}>
      <div className="my-results__history-header">
        <div className="my-results__history-heading">
          <h3 id={headingId} className="my-results__history-title">Points leaderboard</h3>
          <span className="my-results__history-caption">One overall ranking per contest</span>
        </div>
      </div>
      <HistoryGrid contests={contests} rows={rows} label="Points leaderboard by contest" />
    </section>
  );
}

function ClassicHistory({
  contests,
  stats,
  leaderboard,
  onOpen,
}: {
  contests: MyResultsContest[];
  stats: MyResultsStats;
  leaderboard: MyResultsLeaderboard;
  onOpen: (c: MyResultsContest) => void;
}) {
  const headingId = useId();
  const votesRank = rankText(leaderboard.totalVotes);

  const categoryRow = (
    key: VoteCategory,
    label: string,
    pick: (c: MyResultsContest) => CategoryResult | null | undefined,
  ): HistoryRow => ({
    key,
    label,
    renderCell: c => {
      const result = pick(c) ?? EMPTY_CATEGORY;
      return (
        <ResultCell
          submitted={result.hasSubmission}
          place={result.bestPlace}
          thumbUrl={cellThumb(result)}
          onClick={result.hasSubmission ? () => onOpen(c) : null}
          ariaLabel={`${formatMonthLong(c.month)}, ${label}: ${cellStatus(result.hasSubmission, result.bestPlace)}`}
        />
      );
    },
  });

  const rows: HistoryRow[] = [
    categoryRow('theme', 'Theme', c => c.themeResult),
    categoryRow('favorite', 'Favorite', c => c.favoriteResult),
    categoryRow('wildcard', 'Bonus Challenge', c => c.wildcardResult),
  ];

  return (
    <section className="my-results__history-section fade-in-up" aria-labelledby={headingId}>
      <div className="my-results__history-header">
        <div className="my-results__history-heading">
          <h3 id={headingId} className="my-results__history-title">Classic results</h3>
          <span className="my-results__history-caption">Three categories</span>
        </div>
        <p className="my-results__history-explainer">
          Before the points leaderboard, each contest had three separate podiums: Theme, Personal
          Favorite, and Bonus Challenge.
        </p>
        <div className="my-results__history-chips">
          <span className="my-results__chip">
            <TrendingUp size={14} aria-hidden="true" />
            <span>
              Votes earned <strong className="my-results__chip-value">{stats.totalVotes}</strong>
              {votesRank && <span className="my-results__chip-meta"> &middot; {votesRank}</span>}
            </span>
          </span>
          <span className="my-results__chip">
            <Star size={14} aria-hidden="true" />
            <span>
              Best category: <strong className="my-results__chip-value">{bestCategoryLabel(stats.bestCategory)}</strong>
            </span>
          </span>
        </div>
      </div>
      <HistoryGrid contests={contests} rows={rows} label="Classic results by contest and category" />
    </section>
  );
}

/* ── Stat Card ───────────────────────────────── */

function StatCard({
  icon,
  value,
  label,
  rank,
  variant,
  detail,
  hint,
}: {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  rank?: string;
  variant?: 'gold' | 'silver' | 'bronze' | 'secondary';
  /** Shown between the label and the rank. */
  detail?: React.ReactNode;
  /** Small explanatory line under the rank. */
  hint?: string;
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
      {detail}
      {rank && <span className="my-results__stat-rank">{rank}</span>}
      {hint && <span className="my-results__stat-hint">{hint}</span>}
    </div>
  );
}

/** "3 category · 2 overall" — where an all-time place count came from. */
function PlacementSplit({ total, overall }: { total: number; overall: number }) {
  return (
    <span className="my-results__stat-split">
      <span><strong>{Math.max(0, total - overall)}</strong> category</span>
      <span className="my-results__stat-split-sep" aria-hidden="true">&middot;</span>
      <span><strong>{overall}</strong> overall</span>
    </span>
  );
}

/* ── Performance Overview ────────────────────── */

function PerformanceOverview({ stats: s, leaderboard: lb }: { stats: MyResultsStats; leaderboard: MyResultsLeaderboard }) {
  // All-time counts; break them down only when there are two kinds of history.
  const showSplit = s.hasClassicResults && s.hasPointsResults;

  return (
    <>
      <h2 className="my-results__section-title fade-in-up">Performance Overview</h2>

      <div className="my-results__podium-row fade-in-up delay-1">
        <StatCard
          icon={<Trophy size={32} />}
          value={s.firstPlaceFinishes}
          label="1st Place"
          rank={rankText(lb.firstPlace)}
          variant="gold"
          detail={showSplit ? <PlacementSplit total={s.firstPlaceFinishes} overall={s.overallFirstPlaceFinishes} /> : null}
        />
        <StatCard
          icon={<Trophy size={32} />}
          value={s.secondPlaceFinishes}
          label="2nd Place"
          rank={rankText(lb.secondPlace)}
          variant="silver"
          detail={showSplit ? <PlacementSplit total={s.secondPlaceFinishes} overall={s.overallSecondPlaceFinishes} /> : null}
        />
        <StatCard
          icon={<Trophy size={32} />}
          value={s.thirdPlaceFinishes}
          label="3rd Place"
          rank={rankText(lb.thirdPlace)}
          variant="bronze"
          detail={showSplit ? <PlacementSplit total={s.thirdPlaceFinishes} overall={s.overallThirdPlaceFinishes} /> : null}
        />
      </div>

      <div
        className={`my-results__secondary-row${s.hasPointsResults ? '' : ' my-results__secondary-row--two'} fade-in-up delay-2`}
      >
        {s.hasPointsResults && (
          <>
            <StatCard
              icon={<Sparkles size={24} />}
              value={s.totalPoints}
              label="Points"
              rank={rankText(lb.totalPoints)}
              variant="secondary"
            />
            <StatCard
              icon={<Crown size={24} />}
              value={s.firstChoiceVotes}
              label="#1 Theme Votes"
              rank={rankText(lb.firstChoiceVotes)}
              variant="secondary"
              hint="Times voters ranked your photo 1st for the theme"
            />
          </>
        )}
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
      </div>
    </>
  );
}

/* ── Main Page ───────────────────────────────── */

export default function MyResultsPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  useScrollReveal();

  const [data, setData] = useState<MyResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

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

  const openLightbox = (contest: MyResultsContest) => {
    const items = buildLightboxItems(contest);
    if (items.length === 0) return;
    setLightbox({ contest, items, index: 0 });
  };

  const navigateLightbox = useCallback((dir: -1 | 1) => {
    setLightbox(prev => {
      if (!prev) return prev;
      const len = prev.items.length;
      const next = (prev.index + dir + len) % len;
      return { ...prev, index: next };
    });
  }, []);

  if (authLoading) return null;

  const s = data?.stats;
  const lb = data?.leaderboard;
  const contests = data?.contests ?? [];
  const pointsContests = contests.filter(c => isPointsContest(c));
  const classicContests = contests.filter(c => !isPointsContest(c));

  return (
    <div className="my-results">
      {/* Hero */}
      <section className="my-results__hero">
        <div className="my-results__hero-content fade-in-up">
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
            <PerformanceOverview stats={s} leaderboard={lb} />

            {/* Competition History: the points leaderboard, then the classic archive */}
            <div className="my-results__grid-wrapper">
              <h2 className="my-results__section-title fade-in-up">Competition History</h2>

              {pointsContests.length > 0 && (
                <PointsHistory contests={pointsContests} onOpen={openLightbox} />
              )}

              {classicContests.length > 0 && (
                <ClassicHistory
                  contests={classicContests}
                  stats={s}
                  leaderboard={lb}
                  onOpen={openLightbox}
                />
              )}
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
