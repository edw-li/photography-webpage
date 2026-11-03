import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Camera, Check, Heart, Maximize2, Plus, Sparkles, Trophy, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Contest, ContestSubmission } from '../../types/contest';
import { formatPoints, THEME_RANK_POINTS } from '../../types/contest';
import { castBallot } from '../../api/contests';
import { useAuth } from '../../contexts/AuthContext';
import { medalColor } from '../../utils/contestPlacements';
import { getImageUrl } from '../../utils/imageUrl';
import { shuffleArray } from '../../utils/shuffle';
import VoteLightbox from './VoteLightbox';
import WizardProgressBar from './WizardProgressBar';

/* --- Points ballot ---
   Rank the top 3 photos for the theme (3 / 2 / 1 pts), then optionally pick a
   Personal Favorite (+1) and, when the contest has one, a Bonus Challenge
   photo (+1). One photo may collect a rank, the favorite and the bonus pick.
   The voter's own photos are shown but can't be picked. */

type StepKind = 'theme' | 'favorite' | 'bonus' | 'review';

/** Theme picks by rank: index 0 is the 1st choice, null an empty slot. */
type Slots = (number | null)[];

const ORDINALS = ['1st', '2nd', '3rd'];
const MAX_RANKS = THEME_RANK_POINTS.length;

function rankPoints(index: number): number {
  return THEME_RANK_POINTS[index];
}

// Theme-step copy. With a single eligible photo there is nothing to rank, so
// it reads as one pick (never "top 1").

function themeStepLabel(required: number): string {
  return required === 1 ? 'Theme pick' : `Theme top ${required}`;
}

function themeTitle(required: number): string {
  return required === 1 ? 'Pick your top photo for the theme' : `Rank your top ${required} for the theme`;
}

function themeHelp(required: number): string {
  if (required === 1) return 'Tap a photo — it earns 3 pts.';
  const parts = ['1st earns 3 pts', '2nd 2 pts', '3rd 1 pt'].slice(0, required);
  return `Tap photos in order — ${parts.join(', ')}.`;
}

function rankCapNote(required: number): string {
  return required === 1
    ? 'Your theme pick is set — remove it to swap.'
    : `All ${required} ranks are filled — remove one to swap.`;
}

/** Fit the stored theme picks to the current ballot. Picks that are no longer
    eligible (the photo was removed, or turned out to be the voter's own) leave
    their slot empty, and the tray holds exactly `required` slots — should it
    shrink past a kept pick, the picks close up in rank order. */
function fitSlots(stored: Slots, required: number, isEligible: (id: number) => boolean): Slots {
  const kept = stored.map((id) => (id != null && isEligible(id) ? id : null));
  const source = kept.slice(required).some((id) => id != null)
    ? kept.filter((id) => id != null)
    : kept;
  return Array.from({ length: required }, (_, i) => source[i] ?? null);
}

function StepHeader({
  icon: Icon,
  title,
  count,
  max,
  help,
}: {
  icon: LucideIcon;
  title: string;
  count: number;
  max: number;
  help: string;
}) {
  return (
    <div className="contest__vote-header">
      <div className="contest__vote-header-row">
        <h3 className="contest__vote-header-title">
          <Icon size={18} aria-hidden="true" />
          {title}
        </h3>
        <span
          className={`contest__vote-header-chip${count === max ? ' contest__vote-header-chip--full' : ''}`}
          aria-live="polite"
        >
          {count} / {max}
        </span>
      </div>
      <p className="contest__vote-header-action">{help}</p>
    </div>
  );
}

/** The 1st / 2nd / 3rd slots above the theme grid. */
function RankTray({
  slots,
  subById,
  onMove,
  onRemove,
}: {
  slots: Slots;
  subById: Map<number, ContestSubmission>;
  onMove: (from: number, to: number) => void;
  onRemove: (at: number) => void;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const last = slots.length - 1;

  // Filled slots are keyed by photo, so a move keeps the focused arrow on the
  // photo that moved. Reaching either end disables that arrow, though — then
  // focus hops to the slot's other arrow once the move has rendered.
  const pendingFocusRef = useRef<{ id: number; arrow: 'up' | 'down' } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    listRef.current
      ?.querySelector<HTMLButtonElement>(`[data-slot-id="${pending.id}"] [data-arrow="${pending.arrow}"]`)
      ?.focus();
  });

  const move = (id: number, from: number, to: number) => {
    if (to === 0 || to === last) {
      pendingFocusRef.current = { id, arrow: to < from ? 'down' : 'up' };
    }
    onMove(from, to);
  };

  const remove = (at: number) => {
    // The slot's buttons unmount with the pick; keep focus inside the ballot.
    listRef.current?.focus();
    onRemove(at);
  };

  return (
    <ol
      ref={listRef}
      className="contest__rank-tray"
      style={{ '--rank-slots': slots.length } as CSSProperties}
      tabIndex={-1}
      aria-label="Your theme ranking"
    >
      {slots.map((id, i) => {
        const sub = id == null ? undefined : subById.get(id);
        const color = medalColor(i + 1);
        const head = (
          <span className="contest__rank-slot-head">
            <span className="contest__rank-badge" style={{ background: color }} aria-hidden="true">
              {i + 1}
            </span>
            <span className="contest__rank-slot-place">{ORDINALS[i]}</span>
            <span className="contest__rank-slot-pts">{formatPoints(rankPoints(i))}</span>
          </span>
        );

        if (!sub) {
          return (
            <li key={`empty-${i}`} className="contest__rank-slot contest__rank-slot--empty">
              {head}
              <span className="contest__rank-slot-thumb contest__rank-slot-thumb--empty" aria-hidden="true">
                <Plus size={16} />
              </span>
              <span className="contest__rank-slot-title">Tap a photo below</span>
            </li>
          );
        }

        return (
          <li
            key={sub.id}
            data-slot-id={sub.id}
            className="contest__rank-slot contest__rank-slot--filled"
            style={{ borderColor: color }}
          >
            {head}
            <img className="contest__rank-slot-thumb" src={getImageUrl(sub.url, 'thumb')} alt="" />
            <span className="contest__rank-slot-title">{sub.title}</span>
            <span className="contest__rank-slot-actions">
              {last > 0 && (
                <>
                  <button
                    type="button"
                    className="contest__rank-slot-btn"
                    data-arrow="up"
                    onClick={() => move(sub.id, i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move ${sub.title} up`}
                    title="Move up"
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="contest__rank-slot-btn"
                    data-arrow="down"
                    onClick={() => move(sub.id, i, i + 1)}
                    disabled={i === last}
                    aria-label={`Move ${sub.title} down`}
                    title="Move down"
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                </>
              )}
              <button
                type="button"
                className="contest__rank-slot-btn contest__rank-slot-btn--remove"
                onClick={() => remove(i)}
                aria-label={`Remove ${sub.title}`}
                title="Remove"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Thumbnail grid for one ballot step, in the voter's shuffled order. */
function BallotGrid({
  ids,
  subById,
  picks,
  ranked,
  full,
  label,
  onToggle,
  onExpand,
}: {
  ids: number[];
  subById: Map<number, ContestSubmission>;
  /** Picked ids. On the ranked step the index is the rank (null = empty slot). */
  picks: readonly (number | null)[];
  ranked: boolean;
  /** Every pick is taken, so unpicked photos are capped. */
  full: boolean;
  label: string;
  onToggle: (id: number) => void;
  onExpand: (id: number, trigger: HTMLElement) => void;
}) {
  return (
    <div className="contest__vote-grid" role="group" aria-label={label}>
      {ids.map((id) => {
        const sub = subById.get(id);
        if (!sub) return null;
        const at = picks.indexOf(id);
        const picked = at >= 0;
        const rank = ranked && picked ? at + 1 : null;
        const color = rank == null ? undefined : medalColor(rank);
        const isOwn = sub.isOwn === true;
        const capped = !picked && full;
        // Picking is gated by both reasons; the classes track each separately
        // (dimmed when capped, softened when it's the voter's own photo).
        const disabled = isOwn || capped;
        const ariaLabel = isOwn
          ? `${sub.title} (your submission, not eligible to vote)`
          : rank != null
            ? `${sub.title}, ranked ${ORDINALS[rank - 1]}`
            : sub.title;
        return (
          <div
            key={sub.id}
            className={`contest__vote-thumb${picked ? ' contest__vote-thumb--selected' : ''}${capped ? ' contest__vote-thumb--disabled' : ''}${isOwn ? ' contest__vote-thumb--own' : ''}`}
            style={color ? { borderColor: color } : undefined}
            onClick={() => !disabled && onToggle(sub.id)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                e.preventDefault();
                onToggle(sub.id);
              }
            }}
            tabIndex={disabled ? -1 : 0}
            role="checkbox"
            aria-checked={picked}
            aria-disabled={disabled}
            aria-label={ariaLabel}
          >
            <div className="contest__vote-thumb-image">
              <button
                type="button"
                className="contest__vote-thumb-expand"
                onClick={(e) => {
                  e.stopPropagation();
                  onExpand(sub.id, e.currentTarget);
                }}
                onKeyDown={(e) => {
                  // Stop Enter/Space from bubbling to the thumb's pick toggle.
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
                aria-label={`Expand ${sub.title}`}
              >
                <Maximize2 size={14} aria-hidden="true" />
              </button>
              <img src={getImageUrl(sub.url, 'thumb')} alt={sub.title} loading="lazy" />
              {rank != null ? (
                <div className="contest__vote-rank" style={{ background: color }} aria-hidden="true">
                  {rank}
                </div>
              ) : (
                picked && (
                  <div className="contest__vote-check" aria-hidden="true">
                    <Check size={40} strokeWidth={3} />
                  </div>
                )
              )}
            </div>
            <div className="contest__vote-info">
              <span className="contest__vote-title">{sub.title}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A single optional pick (Personal Favorite / Bonus Challenge) on the review step. */
function ReviewPick({
  label,
  sub,
  onEdit,
}: {
  label: string;
  sub: ContestSubmission | undefined;
  onEdit: () => void;
}) {
  return (
    <div className="contest__wizard-review-category">
      <div className="contest__wizard-review-header">
        <span>
          {label} <span className="contest__review-pick-pts">+1 pt</span>
        </span>
        <button type="button" className="contest__wizard-review-edit" onClick={onEdit}>
          Edit
        </button>
      </div>
      <div className="contest__wizard-review-photos">
        {sub ? (
          <div className="contest__wizard-review-photo">
            <img src={getImageUrl(sub.url, 'thumb')} alt="" />
            <span>{sub.title}</span>
          </div>
        ) : (
          <span className="contest__wizard-review-empty">Skipped</span>
        )}
      </div>
    </div>
  );
}

export default function PointsBallot({
  contest,
  onClose,
  onContestRefresh,
}: {
  contest: Contest;
  onClose: () => void;
  onContestRefresh: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const hasBonus = Boolean(contest.wildcardCategory);
  const bonusLabel = contest.wildcardCategory || 'Bonus Challenge';

  // Per-voter, per-session shuffled ballot, as in the classic wizard: shuffle
  // the id list (not the submission objects) and look each one up by id at
  // render, so an admin edit during voting shows the latest title/url without
  // reordering. Keyed on the sorted-id signature, so it only reshuffles when a
  // submission is added or removed.
  const submissionIdsKey = useMemo(
    () => contest.submissions.map((s) => s.id).sort((a, b) => a - b).join(','),
    [contest.submissions],
  );
  const shuffledIds = useMemo(
    () => shuffleArray(submissionIdsKey ? submissionIdsKey.split(',').map(Number) : []),
    [submissionIdsKey],
  );
  const subById = useMemo(
    () => new Map(contest.submissions.map((s) => [s.id, s])),
    [contest.submissions],
  );

  const isEligible = (id: number) => {
    const sub = subById.get(id);
    return sub != null && sub.isOwn !== true;
  };
  const eligibleCount = contest.submissions.filter((s) => s.isOwn !== true).length;
  // Every theme rank must be filled — or every eligible photo ranked, when
  // fewer than three can be voted for.
  const required = Math.min(MAX_RANKS, eligibleCount);

  const [stepIndex, setStepIndex] = useState(0);
  // Which way the wizard last moved — picks the matching slide-in animation.
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [storedSlots, setStoredSlots] = useState<Slots>([]);
  const [storedFavorite, setStoredFavorite] = useState<number | null>(null);
  const [storedBonus, setStoredBonus] = useState<number | null>(null);
  const [castDone, setCastDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  // Screen-reader echo of ranking changes (a moved photo isn't otherwise announced).
  const [announcement, setAnnouncement] = useState('');
  // Lightbox — null when closed; otherwise the submission id being viewed.
  const [lightboxId, setLightboxId] = useState<number | null>(null);

  // Picks are stored as chosen and fitted to the current submissions on every
  // render, so a pick that becomes invalid (photo removed by an admin, or
  // reassigned to the voter) drops out as soon as the contest refreshes, the
  // way the classic wizard prunes its selections. Without this the voter could
  // submit a ballot the backend rejects, with no way to recover.
  const slots = fitSlots(storedSlots, required, isEligible);
  const favorite = storedFavorite != null && isEligible(storedFavorite) ? storedFavorite : null;
  const bonus = hasBonus && storedBonus != null && isEligible(storedBonus) ? storedBonus : null;
  const filled = slots.filter((id) => id != null).length;
  const firstEmpty = slots.indexOf(null);
  const themeComplete = required > 0 && firstEmpty < 0;
  const voted = castDone || contest.userHasVoted === true;

  const steps: StepKind[] = hasBonus
    ? ['theme', 'favorite', 'bonus', 'review']
    : ['theme', 'favorite', 'review'];
  const step = Math.min(stepIndex, steps.length - 1);
  const currentStep = steps[step];
  const stepLabels = steps.map((kind) =>
    kind === 'theme'
      ? themeStepLabel(required)
      : kind === 'favorite'
        ? 'Personal Favorite'
        : kind === 'bonus'
          ? bonusLabel
          : 'Review',
  );

  const lightboxSub =
    lightboxId == null || currentStep === 'review' ? null : subById.get(lightboxId) ?? null;
  const lightboxIndex = lightboxSub ? shuffledIds.indexOf(lightboxSub.id) : -1;
  const openLightboxId = lightboxSub ? lightboxSub.id : null;

  // The element that opened the lightbox — focus returns to it on close (or
  // if the photo being viewed disappears in a refresh).
  const triggerElRef = useRef<HTMLElement | null>(null);
  const hadLightboxRef = useRef(false);
  useEffect(() => {
    if (openLightboxId != null) {
      hadLightboxRef.current = true;
    } else if (hadLightboxRef.current) {
      triggerElRef.current?.focus();
      triggerElRef.current = null;
      hadLightboxRef.current = false;
    }
  }, [openLightboxId]);

  // Every step change goes through here: it also closes the lightbox and
  // clears a stale submit error.
  const goToStep = (next: number) => {
    setDirection(next < step ? 'backward' : 'forward');
    setStepIndex(next);
    setLightboxId(null);
    setVoteError(null);
  };

  const openLightbox = (id: number, trigger: HTMLElement) => {
    triggerElRef.current = trigger;
    setLightboxId(id);
  };

  const titleOf = (id: number | null) => (id == null ? '' : subById.get(id)?.title ?? '');

  const updateSlots = (next: Slots, message: string) => {
    setStoredSlots(next);
    setAnnouncement(message);
  };

  // Tapping a ranked photo frees its slot (the others keep their ranks);
  // tapping an unranked one fills the first empty slot.
  const toggleRank = (id: number) => {
    const at = slots.indexOf(id);
    const next = slots.slice();
    if (at >= 0) {
      next[at] = null;
      updateSlots(next, `${titleOf(id)} removed from ${ORDINALS[at]}.`);
    } else if (firstEmpty >= 0 && isEligible(id)) {
      next[firstEmpty] = id;
      updateSlots(next, `${titleOf(id)} ranked ${ORDINALS[firstEmpty]}.`);
    }
  };

  // Swap with the neighbouring slot, empty or not.
  const moveRank = (from: number, to: number) => {
    if (to < 0 || to >= slots.length) return;
    const next = slots.slice();
    [next[from], next[to]] = [next[to], next[from]];
    updateSlots(next, `${titleOf(slots[from])} moved to ${ORDINALS[to]}.`);
  };

  const removeRank = (at: number) => {
    const next = slots.slice();
    next[at] = null;
    updateSlots(next, `${titleOf(slots[at])} removed from ${ORDINALS[at]}.`);
  };

  // Single picks: tapping another photo moves the pick; tapping it again clears it.
  const toggleFavorite = (id: number) => {
    if (isEligible(id)) setStoredFavorite(favorite === id ? null : id);
  };
  const toggleBonus = (id: number) => {
    if (isEligible(id)) setStoredBonus(bonus === id ? null : id);
  };

  const handleCast = async () => {
    if (!themeComplete || submitting) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      await castBallot(contest.id, {
        theme: slots.filter((id): id is number => id != null),
        favorite,
        bonus,
      });
      setCastDone(true);
      onContestRefresh();
    } catch (err: unknown) {
      setVoteError(err instanceof Error && err.message ? err.message : 'Failed to cast ballot');
      // A fresh contest lets the ballot recover: picks an admin deleted or
      // reassigned drop out, and a ballot cast elsewhere shows as already voted.
      onContestRefresh();
    }
    setSubmitting(false);
  };

  if (!isAuthenticated) {
    return (
      <div role="tabpanel" aria-label="Vote">
        <div className="contest__submit-success">
          <Camera size={48} />
          <p>Log in to vote</p>
          <Link to="/login" className="contest__modal-btn" onClick={onClose}>
            Log In
          </Link>
        </div>
      </div>
    );
  }

  if (voted) {
    return (
      <div role="tabpanel" aria-label="Vote">
        <div className="contest__submit-success">
          <Check size={48} />
          <p>You&apos;ve already voted in this contest!</p>
          <button className="contest__modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  if (required === 0) {
    return (
      <div role="tabpanel" aria-label="Vote">
        <div className="contest__submit-success">
          <Camera size={48} />
          <p>There are no photos you can vote for in this contest.</p>
          <button className="contest__modal-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const nextLabel =
    (currentStep === 'favorite' && favorite == null) || (currentStep === 'bonus' && bonus == null)
      ? 'Skip'
      : 'Next';

  let lightbox: ReactNode = null;
  if (lightboxSub) {
    const id = lightboxSub.id;
    const shared = {
      sub: lightboxSub,
      index: lightboxIndex,
      total: shuffledIds.length,
      isOwn: lightboxSub.isOwn === true,
      onClose: () => setLightboxId(null),
      onPrev: () => {
        if (lightboxIndex > 0) setLightboxId(shuffledIds[lightboxIndex - 1]);
      },
      onNext: () => {
        if (lightboxIndex >= 0 && lightboxIndex < shuffledIds.length - 1) {
          setLightboxId(shuffledIds[lightboxIndex + 1]);
        }
      },
    };
    if (currentStep === 'theme') {
      const at = slots.indexOf(id);
      lightbox = (
        <VoteLightbox
          {...shared}
          isSelected={at >= 0}
          atSelectionCap={themeComplete}
          selectLabel={firstEmpty >= 0 ? `Rank as ${ORDINALS[firstEmpty]}` : 'Rank'}
          selectedLabel={`Ranked ${ORDINALS[at]} — click to remove`}
          capNote={rankCapNote(required)}
          onToggleSelect={() => toggleRank(id)}
        />
      );
    } else {
      const isFavoriteStep = currentStep === 'favorite';
      lightbox = (
        <VoteLightbox
          {...shared}
          isSelected={(isFavoriteStep ? favorite : bonus) === id}
          atSelectionCap={false}
          selectLabel={isFavoriteStep ? 'Choose as favorite' : 'Choose for bonus'}
          selectedLabel="Chosen — click to clear"
          onToggleSelect={() => (isFavoriteStep ? toggleFavorite(id) : toggleBonus(id))}
        />
      );
    }
  }

  return (
    <div role="tabpanel" aria-label="Vote">
      <WizardProgressBar steps={stepLabels} currentStep={step} />

      <div key={step} className={`contest__vote-step contest__vote-step--${direction}`}>
        {currentStep === 'theme' && (
          <>
            <StepHeader
              icon={Trophy}
              title={themeTitle(required)}
              count={filled}
              max={required}
              help={themeHelp(required)}
            />
            <RankTray slots={slots} subById={subById} onMove={moveRank} onRemove={removeRank} />
            <p className="contest__sr-only" aria-live="polite">{announcement}</p>
            <BallotGrid
              ids={shuffledIds}
              subById={subById}
              picks={slots}
              ranked
              full={themeComplete}
              label="Theme photos"
              onToggle={toggleRank}
              onExpand={openLightbox}
            />
          </>
        )}

        {currentStep === 'favorite' && (
          <>
            <StepHeader
              icon={Heart}
              title="Personal Favorite"
              count={favorite == null ? 0 : 1}
              max={1}
              help="Optional — the one photo you love most, for any reason (+1 pt). It can be one you ranked."
            />
            <BallotGrid
              ids={shuffledIds}
              subById={subById}
              picks={favorite == null ? [] : [favorite]}
              ranked={false}
              full={false}
              label="Personal Favorite photos"
              onToggle={toggleFavorite}
              onExpand={openLightbox}
            />
          </>
        )}

        {currentStep === 'bonus' && (
          <>
            <StepHeader
              icon={Sparkles}
              title={bonusLabel}
              count={bonus == null ? 0 : 1}
              max={1}
              help="Optional — the photo that best meets this month's bonus challenge (+1 pt)."
            />
            <BallotGrid
              ids={shuffledIds}
              subById={subById}
              picks={bonus == null ? [] : [bonus]}
              ranked={false}
              full={false}
              label={`${bonusLabel} photos`}
              onToggle={toggleBonus}
              onExpand={openLightbox}
            />
          </>
        )}

        {currentStep === 'review' && (
          <>
            <div className="contest__wizard-review">
              <p className="contest__modal-subtitle">Review your ballot</p>
              {voteError && <p className="contest__submit-error">{voteError}</p>}

              <div className="contest__wizard-review-category">
                <div className="contest__wizard-review-header">
                  <span>{themeStepLabel(required)}</span>
                  <button
                    type="button"
                    className="contest__wizard-review-edit"
                    onClick={() => goToStep(steps.indexOf('theme'))}
                  >
                    Edit
                  </button>
                </div>
                <ol className="contest__review-ranks">
                  {slots.map((id, i) => {
                    const sub = id == null ? undefined : subById.get(id);
                    return (
                      <li
                        key={i}
                        className={`contest__review-rank${sub ? '' : ' contest__review-rank--empty'}`}
                      >
                        <span
                          className="contest__rank-badge"
                          style={{ background: medalColor(i + 1) }}
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                        {sub ? (
                          <img
                            className="contest__review-rank-thumb"
                            src={getImageUrl(sub.url, 'thumb')}
                            alt=""
                          />
                        ) : (
                          <span className="contest__review-rank-thumb" aria-hidden="true" />
                        )}
                        <span className="contest__review-rank-title">
                          {sub ? sub.title : 'Not ranked yet'}
                        </span>
                        <span className="contest__review-rank-pts">{formatPoints(rankPoints(i))}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <ReviewPick
                label="Personal Favorite"
                sub={favorite == null ? undefined : subById.get(favorite)}
                onEdit={() => goToStep(steps.indexOf('favorite'))}
              />
              {hasBonus && (
                <ReviewPick
                  label={bonusLabel}
                  sub={bonus == null ? undefined : subById.get(bonus)}
                  onEdit={() => goToStep(steps.indexOf('bonus'))}
                />
              )}
            </div>
            <p className="contest__submit-disclaimer">Once submitted, your ballot cannot be changed.</p>
          </>
        )}
      </div>

      <div className="contest__wizard-footer">
        <button
          type="button"
          className="contest__modal-btn"
          onClick={() => goToStep(step - 1)}
          disabled={step === 0 || submitting}
        >
          Back
        </button>
        {currentStep === 'review' ? (
          <button
            type="button"
            className="contest__modal-btn contest__modal-btn--submit"
            onClick={handleCast}
            disabled={submitting || !themeComplete}
            style={{ width: 'auto', marginTop: 0 }}
          >
            {submitting ? 'Submitting...' : 'Cast Ballot'}
          </button>
        ) : (
          <button
            type="button"
            className="contest__modal-btn"
            onClick={() => goToStep(step + 1)}
            disabled={currentStep === 'theme' && !themeComplete}
          >
            {nextLabel}
          </button>
        )}
      </div>

      {lightbox}
    </div>
  );
}
