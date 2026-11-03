import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react';
import type { Contest, ContestSubmission } from '../../types/contest';
import { formatPoints, POINTS_TIEBREAK_RULE, tiebreakLabel } from '../../types/contest';
import type { PlacementGroups, RankedSubmission } from '../../utils/contestPlacements';
import {
  FULL_RESULTS_CAP,
  groupWinnersByPlace,
  medalColor,
  placeLabel,
  rankByPoints,
} from '../../utils/contestPlacements';
import { getImageUrl } from '../../utils/imageUrl';

/* --- Results of a completed points contest: one leaderboard ---
   Places come from the backend (`contest.winners`, category 'overall', and
   each submission's `score`). Full ties share a place, numbered 1, 1, 3. */

const PLACE_ORDINALS = ['1st', '2nd', '3rd'];

/** "2 photos share 1st place, so there's no 2nd place." Places are numbered
    1, 1, 3, so a group of n sharing place p uses up places p … p+n-1; this
    names the podium places that tie left empty. */
function SharedPlaceNote({ groups, place }: { groups: PlacementGroups; place: 1 | 2 }) {
  const byPlace = [groups.first, groups.second, groups.third];
  const count = byPlace[place - 1].length;
  const skipped: string[] = [];
  for (let next = place + 1; next < place + count && next <= byPlace.length; next++) {
    if (byPlace[next - 1].length === 0) skipped.push(PLACE_ORDINALS[next - 1]);
  }
  if (skipped.length === 0) return null;
  return (
    <p className="contest__winners-skip-note">
      {count} photos share {PLACE_ORDINALS[place - 1]} place, so there&apos;s no {skipped.join(' or ')} place.
    </p>
  );
}

/** "Tied on points · ordered by …" — only for photos a tiebreaker ordered. */
function TiebreakNote({ sub }: { sub: ContestSubmission }) {
  const tiebreak = sub.score?.tiebreak;
  if (!tiebreak) return null;
  return (
    <span className="contest__points-tiebreak">
      Tied on points · ordered by {tiebreakLabel(tiebreak)}
    </span>
  );
}

function PointsLegend({ hasBonus }: { hasBonus: boolean }) {
  return (
    <p className="contest__points-legend">
      Ranked by total points: theme picks earn 3 / 2 / 1,{' '}
      {hasBonus ? 'Personal Favorite and Bonus picks earn 1 each' : 'Personal Favorite picks earn 1 each'}.{' '}
      {POINTS_TIEBREAK_RULE}
    </p>
  );
}

function PointsPlaceGroup({ place, rows }: { place: 2 | 3; rows: RankedSubmission[] }) {
  if (rows.length === 0) return null;
  const color = medalColor(place);
  return (
    <div className="contest__winners-group">
      <h3 className="contest__winners-group-heading">
        <Trophy size={16} color={color} aria-hidden="true" />
        <span style={{ color }}>{placeLabel(place)}</span>
        {rows.length > 1 && (
          <span className="contest__winners-group-tie">{rows.length}-way tie</span>
        )}
      </h3>
      <div className="contest__results-list">
        {rows.map(({ sub, votes }) => (
          <div
            key={sub.id}
            className="contest__results-row contest__results-row--medal"
            style={{ borderLeftColor: color }}
          >
            <span className="contest__results-rank" style={{ color }}>{place}</span>
            <img
              className="contest__results-thumb"
              src={getImageUrl(sub.url, 'thumb')}
              alt={sub.title}
              loading="lazy"
            />
            <div className="contest__results-info">
              <span className="contest__results-name">{sub.title}</span>
              <span className="contest__results-photographer">{sub.photographer}</span>
              <TiebreakNote sub={sub} />
            </div>
            <span className="contest__results-votes">{formatPoints(votes)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Winners tab: a 1st-place hero (a carousel when several share 1st), then
    the 2nd and 3rd place groups. */
export function PointsWinners({ contest }: { contest: Contest }) {
  const [heroIndex, setHeroIndex] = useState(0);
  // Which way the tied-firsts carousel last moved — picks the matching
  // slide-in animation on the remounted hero image.
  const [heroDirection, setHeroDirection] = useState<'next' | 'prev'>('next');
  const hasBonus = Boolean(contest.wildcardCategory);

  const groups = useMemo(() => groupWinnersByPlace(contest, 'overall'), [contest]);

  // Warm the browser cache for every tied first so arrowing between them
  // transitions over an already-loaded image instead of a blank frame.
  useEffect(() => {
    if (groups.first.length <= 1) return;
    for (const row of groups.first) {
      const img = new Image();
      img.src = getImageUrl(row.sub.url, 'full');
    }
  }, [groups.first]);

  // Clamp instead of resetting in an effect: a contest refresh can shrink the
  // tied-firsts list while the carousel is past the new end.
  const firstCount = groups.first.length;
  const safeIndex = firstCount > 0 ? Math.min(heroIndex, firstCount - 1) : 0;
  const hero = firstCount > 0 ? groups.first[safeIndex] : null;
  const heroScore = hero?.sub.score;
  const hasAnyWinner = firstCount > 0 || groups.second.length > 0 || groups.third.length > 0;

  return (
    <div role="tabpanel" aria-label="Winners">
      {!hasAnyWinner && <p className="contest__modal-subtitle">No winners announced.</p>}

      {hero && (
        <div className="contest__winners-hero" role="group" aria-label="First place">
          <div className="contest__winners-hero-frame">
            {/* Ambient fill behind off-aspect images — blurred, so the cheap
                thumbnail is all it needs. */}
            <img
              key={`backdrop-${hero.sub.id}`}
              src={getImageUrl(hero.sub.url, 'thumb')}
              alt=""
              aria-hidden="true"
              className="contest__winners-hero-backdrop"
            />
            <img
              key={hero.sub.id}
              src={getImageUrl(hero.sub.url, 'full')}
              alt={hero.sub.title}
              className={`contest__winners-hero-img contest__winners-hero-img--${heroDirection}`}
            />
            {firstCount > 1 && (
              <>
                <button
                  className="contest__winners-hero-arrow contest__winners-hero-arrow--left"
                  onClick={() => {
                    setHeroDirection('prev');
                    setHeroIndex((safeIndex - 1 + firstCount) % firstCount);
                  }}
                  aria-label="Previous first place winner"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  className="contest__winners-hero-arrow contest__winners-hero-arrow--right"
                  onClick={() => {
                    setHeroDirection('next');
                    setHeroIndex((safeIndex + 1) % firstCount);
                  }}
                  aria-label="Next first place winner"
                >
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          <div className="contest__winners-hero-info">
            <div className="contest__winners-hero-label">
              <Trophy size={18} color="#FFD700" aria-hidden="true" />
              <span>1st Place</span>
              {firstCount > 1 && (
                <span className="contest__winners-hero-counter" aria-live="polite">
                  {safeIndex + 1} of {firstCount}
                </span>
              )}
            </div>
            <div key={hero.sub.id} className="contest__winners-hero-meta">
              <h3 className="contest__winners-hero-title">{hero.sub.title}</h3>
              <p className="contest__winners-hero-photographer">{hero.sub.photographer}</p>
              <span className="contest__winners-hero-votes">{formatPoints(hero.votes)}</span>
              {heroScore && (
                <span className="contest__winners-hero-breakdown">
                  Theme {heroScore.themePoints} · Favorite {heroScore.favorite}
                  {hasBonus ? ` · Bonus ${heroScore.bonus}` : ''}
                </span>
              )}
              <TiebreakNote sub={hero.sub} />
            </div>
            {firstCount > 1 && (
              <span className="contest__winners-hero-tie-note">
                {firstCount}-way tie — shared 1st place
              </span>
            )}
          </div>
        </div>
      )}

      <SharedPlaceNote groups={groups} place={1} />
      <PointsPlaceGroup place={2} rows={groups.second} />
      <SharedPlaceNote groups={groups} place={2} />
      <PointsPlaceGroup place={3} rows={groups.third} />

      {hasAnyWinner && <PointsLegend hasBonus={hasBonus} />}
    </div>
  );
}

/** Full Results tab: the whole leaderboard as one list. */
export function PointsFullResults({ contest }: { contest: Contest }) {
  // Leaderboard order as the backend ranked it; full ties share a rank and
  // list earlier submissions first.
  const ranked = useMemo(() => rankByPoints(contest.submissions), [contest.submissions]);

  // Top 10 rows only. Medals sort to the front, so the slice can only cut
  // honorable mentions — except in the unlikely case a tie pushes the medal
  // count past the cap, where winners still all show.
  const visible = useMemo(() => {
    const medalCount = ranked.filter((r) => r.isMedal).length;
    return ranked.slice(0, Math.max(FULL_RESULTS_CAP, medalCount));
  }, [ranked]);

  const stats = useMemo(() => {
    let totalPoints = 0;
    for (const row of ranked) totalPoints += row.votes;
    const avgPoints = ranked.length > 0 ? (totalPoints / ranked.length).toFixed(1) : '0';
    const uniquePhotographers = new Set(contest.submissions.map((s) => s.photographer)).size;
    return { totalPoints, avgPoints, uniquePhotographers };
  }, [ranked, contest.submissions]);

  return (
    <div role="tabpanel" aria-label="Full Results">
      <div className="contest__results-list">
        {visible.map(({ sub, votes, rank, isMedal }) => {
          const color = isMedal ? medalColor(rank) : undefined;
          return (
            <div
              key={sub.id}
              className={`contest__results-row${isMedal ? ' contest__results-row--medal' : ''}`}
              style={color ? { borderLeftColor: color } : undefined}
            >
              {/* Non-winners get an inclusive "HM" instead of a rank number,
                  and no points — nobody should feel bad about placing 10th or
                  drawing a single point. */}
              <span
                className="contest__results-rank"
                style={color ? { color } : undefined}
                title={isMedal ? undefined : 'Honorable Mention'}
              >
                {isMedal ? rank : 'HM'}
              </span>
              <img
                className="contest__results-thumb"
                src={getImageUrl(sub.url, 'thumb')}
                alt={sub.title}
                loading="lazy"
              />
              <div className="contest__results-info">
                <span className="contest__results-name">{sub.title}</span>
                <span className="contest__results-photographer">{sub.photographer}</span>
                {isMedal && <TiebreakNote sub={sub} />}
              </div>
              {isMedal && <span className="contest__results-votes">{formatPoints(votes)}</span>}
            </div>
          );
        })}
      </div>

      <PointsLegend hasBonus={Boolean(contest.wildcardCategory)} />

      <div className="contest__results-stats">
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.totalPoints}</span>
          <span className="contest__results-stat-label">Total Points</span>
        </div>
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.avgPoints}</span>
          <span className="contest__results-stat-label">Avg Points / Photo</span>
        </div>
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.uniquePhotographers}</span>
          <span className="contest__results-stat-label">Unique Photographers</span>
        </div>
      </div>
    </div>
  );
}
