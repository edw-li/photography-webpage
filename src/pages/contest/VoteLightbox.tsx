import { useEffect, useRef } from 'react';
import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { ContestSubmission } from '../../types/contest';
import { useImageLoaded } from '../../hooks/useImageLoaded';
import { getImageUrl } from '../../utils/imageUrl';

/* --- Vote Lightbox (overlays the voting modal during ballot review) --- */

export default function VoteLightbox({
  sub,
  index,
  total,
  isSelected,
  atSelectionCap,
  isOwn,
  onClose,
  onPrev,
  onNext,
  onToggleSelect,
  selectLabel = 'Select',
  selectedLabel = 'Selected — click to deselect',
  capNote = '3 of 3 already chosen — deselect one to swap.',
}: {
  sub: ContestSubmission;
  index: number;
  total: number;
  isSelected: boolean;
  atSelectionCap: boolean;
  isOwn: boolean;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleSelect: () => void;
  /** Button label while the photo is not selected. */
  selectLabel?: string;
  /** Button label while the photo is selected (shown after a check icon). */
  selectedLabel?: string;
  /** Note shown when the photo can't be selected because the step is full. */
  capNote?: string;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const fullSrc = getImageUrl(sub.url, 'full');
  const { loaded, errored, handleLoad, handleError, imgRef } = useImageLoaded(fullSrc);

  // Own submissions are never selectable; otherwise users can deselect anytime
  // and select only when below the cap.
  const canSelect = !isOwn && (isSelected || !atSelectionCap);
  const hasPrev = index > 0;
  const hasNext = index >= 0 && index < total - 1;

  // Auto-focus the close button on open so keyboard users can act immediately.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // Keyboard handling — registered in capture phase so we can stopImmediatePropagation
  // BEFORE the outer ModalShell's bubble-phase listener sees the event. Without this,
  // pressing Escape would close both the lightbox and the underlying voting modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowLeft') {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (hasPrev) onPrev();
      } else if (e.key === 'ArrowRight') {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (hasNext) onNext();
      } else if (e.key === 'Tab') {
        // Lightbox-local focus trap; intercept before the outer modal's trap fires.
        const el = panelRef.current;
        if (!el) return;
        const focusable = el.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"]), a[href]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.stopImmediatePropagation();
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.stopImmediatePropagation();
          e.preventDefault();
          first.focus();
        } else if (active && !el.contains(active)) {
          // Focus drifted outside (rare) — reel it back in.
          e.stopImmediatePropagation();
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  return (
    <div
      className="contest__lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="contest-lightbox-title"
      onClick={onClose}
    >
      <div
        className="contest__lightbox-panel"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="contest__lightbox-close"
          ref={closeBtnRef}
          onClick={onClose}
          aria-label="Close image preview"
        >
          <X size={20} />
        </button>

        <div className="contest__lightbox-image-wrap">
          {!loaded && !errored && <div className="contest__lightbox-spinner" aria-hidden="true" />}
          {errored ? (
            <div className="contest__lightbox-error">
              <p>Failed to load full image.</p>
            </div>
          ) : (
            <img
              ref={imgRef}
              src={fullSrc}
              alt={isOwn ? `${sub.title} (your submission)` : sub.title}
              onLoad={handleLoad}
              onError={handleError}
              className={`contest__lightbox-image${loaded ? ' contest__lightbox-image--loaded' : ''}`}
            />
          )}
        </div>

        <div className="contest__lightbox-info">
          <div className="contest__lightbox-meta">
            <h3 id="contest-lightbox-title" className="contest__lightbox-title">{sub.title}</h3>
          </div>

          <div className="contest__lightbox-actions">
            <div className="contest__lightbox-nav">
              <button
                type="button"
                className="contest__lightbox-nav-btn"
                onClick={onPrev}
                disabled={!hasPrev}
                aria-label="Previous image"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="contest__lightbox-counter" aria-live="polite">
                {index + 1} of {total}
              </span>
              <button
                type="button"
                className="contest__lightbox-nav-btn"
                onClick={onNext}
                disabled={!hasNext}
                aria-label="Next image"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="contest__lightbox-select">
              {isOwn ? (
                <div className="contest__lightbox-own-label" role="status">
                  Your submission
                </div>
              ) : (
                <button
                  type="button"
                  className={`contest__modal-btn${isSelected ? ' contest__lightbox-select-btn--remove' : ''}`}
                  onClick={onToggleSelect}
                  disabled={!canSelect}
                  style={{ marginTop: 0 }}
                >
                  {isSelected
                    ? (<><Check size={16} aria-hidden="true" /> {selectedLabel}</>)
                    : selectLabel}
                </button>
              )}
              <span className="contest__lightbox-cap-note" aria-live="polite">
                {isOwn
                  ? "You can't vote for your own submission."
                  : !isSelected && atSelectionCap
                    ? capNote
                    : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
