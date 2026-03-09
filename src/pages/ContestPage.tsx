import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Camera, Users, Check, Trophy, ArrowLeft, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Contest, ContestSubmission, VoteCategory } from '../types/contest';
import { getCategoryLabel } from '../types/contest';
import type { PhotoExif } from '../types/gallery';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { useAuth } from '../contexts/AuthContext';
import { getContests, submitPhoto, castVote } from '../api/contests';
import Footer from '../components/Footer';
import { getImageUrl } from '../utils/imageUrl';
import './ContestPage.css';

const BATCH_SIZE = 5;

function formatDeadline(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatExif(exif?: PhotoExif): string {
  if (!exif) return '';
  const parts: string[] = [];
  if (exif.camera) parts.push(exif.camera);
  if (exif.focalLength) parts.push(exif.focalLength);
  if (exif.aperture) parts.push(exif.aperture);
  if (exif.shutterSpeed) parts.push(exif.shutterSpeed);
  if (exif.iso != null) parts.push(`ISO ${exif.iso}`);
  return parts.join(' · ');
}

/* --- Tab config --- */

type TabId = 'submit' | 'vote' | 'rules' | 'gallery' | 'podium' | 'full-results';

interface TabDef {
  id: TabId;
  label: string;
}

const TABS_BY_STATUS: Record<Contest['status'], TabDef[]> = {
  active: [
    { id: 'rules', label: 'Rules' },
    { id: 'submit', label: 'Submit' },
  ],
  voting: [
    { id: 'rules', label: 'Rules' },
    { id: 'vote', label: 'Vote' },
  ],
  completed: [
    { id: 'podium', label: 'Podium' },
    { id: 'full-results', label: 'Full Results' },
    { id: 'gallery', label: 'Gallery' },
  ],
};

const HEIGHT_REF_TAB: Record<Contest['status'], TabId> = {
  active: 'submit',
  voting: 'vote',
  completed: 'podium',
};

/* --- Shared Modal Shell --- */

function ModalShell({
  open,
  onClose,
  ariaLabel,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const startClose = useCallback(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setIsClosing(true);
    }
  }, [onClose]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, startClose]);

  useEffect(() => {
    if (!open) return;
    const el = modalRef.current;
    if (!el) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = el.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"]), a[href], input, textarea, select'
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
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={`contest__modal-backdrop${isClosing ? ' contest__modal-backdrop--closing' : ''}`}
      onClick={startClose}
      onAnimationEnd={() => { if (isClosing) { setIsClosing(false); onClose(); } }}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className="contest__modal" onClick={(e) => e.stopPropagation()}>
        <button
          className="contest__modal-close"
          onClick={startClose}
          aria-label="Close"
          ref={closeRef}
        >
          &times;
        </button>
        {children}
      </div>
    </div>
  );
}

/* --- Tab Bar --- */

function TabBar({
  tabs,
  activeTab,
  onTabChange,
  isAuthenticated = true,
}: {
  tabs: TabDef[];
  activeTab: TabId;
  onTabChange: (id: TabId) => void;
  isAuthenticated?: boolean;
}) {
  const tabListRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tabList = tabListRef.current;
    const indicator = indicatorRef.current;
    if (!tabList || !indicator) return;

    const activeBtn = tabList.querySelector<HTMLButtonElement>(
      `[data-tab-id="${activeTab}"]`
    );
    if (activeBtn) {
      indicator.style.left = `${activeBtn.offsetLeft}px`;
      indicator.style.width = `${activeBtn.offsetWidth}px`;
    }
  }, [activeTab]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === activeTab);
    let nextIdx = idx;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIdx = (idx + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIdx = (idx - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIdx = tabs.length - 1;
    } else {
      return;
    }

    onTabChange(tabs[nextIdx].id);
    const tabList = tabListRef.current;
    if (tabList) {
      const btn = tabList.querySelector<HTMLButtonElement>(
        `[data-tab-id="${tabs[nextIdx].id}"]`
      );
      btn?.focus();
    }
  };

  return (
    <div className="contest__tab-bar" ref={tabListRef} role="tablist" onKeyDown={handleKeyDown}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const isDisabled = !isAuthenticated && (tab.id === 'submit' || tab.id === 'vote');
        return (
          <button
            key={tab.id}
            className={`contest__tab${isActive ? ' contest__tab--active' : ''}${isDisabled ? ' contest__tab--disabled' : ''}`}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-tab-id={tab.id}
            onClick={() => onTabChange(tab.id)}
          >
            {isDisabled && <Lock size={12} />}
            {tab.label}
          </button>
        );
      })}
      <div className="contest__tab-indicator" ref={indicatorRef} />
    </div>
  );
}

/* --- Tab: Submit --- */

function TabSubmit({
  contest,
  onClose,
  file,
  setFile,
  title,
  setTitle,
  camera,
  setCamera,
  focalLength,
  setFocalLength,
  aperture,
  setAperture,
  shutterSpeed,
  setShutterSpeed,
  iso,
  setIso,
  submitted,
  setSubmitted,
  onContestRefresh,
}: {
  contest: Contest;
  onClose: () => void;
  file: File | null;
  setFile: (f: File | null) => void;
  title: string;
  setTitle: (v: string) => void;
  camera: string;
  setCamera: (v: string) => void;
  focalLength: string;
  setFocalLength: (v: string) => void;
  aperture: string;
  setAperture: (v: string) => void;
  shutterSpeed: string;
  setShutterSpeed: (v: string) => void;
  iso: string;
  setIso: (v: string) => void;
  submitted: boolean;
  setSubmitted: (v: boolean) => void;
  onContestRefresh: () => void;
}) {
  const { isAuthenticated, user } = useAuth();
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userSubCount = contest.userSubmissionCount ?? 0;
  const remaining = Math.max(0, 3 - userSubCount);
  const atLimit = userSubCount >= 3;

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canSubmit = file !== null && title.trim() !== '' && !atLimit;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (atLimit) return;
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) setFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !file) return;
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('photographer', `${user!.firstName} ${user!.lastName}`);
      if (camera.trim()) formData.append('exif_camera', camera.trim());
      if (focalLength.trim()) formData.append('exif_focal_length', focalLength.trim());
      if (aperture.trim()) formData.append('exif_aperture', aperture.trim());
      if (shutterSpeed.trim()) formData.append('exif_shutter_speed', shutterSpeed.trim());
      if (iso.trim()) formData.append('exif_iso', iso.trim());
      await submitPhoto(contest.id, formData);
      setSubmitted(true);
      onContestRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit photo';
      setError(msg);
    }
    setSubmitting(false);
  };

  if (!isAuthenticated) {
    return (
      <div role="tabpanel" aria-label="Submit">
        <div className="contest__submit-success">
          <Camera size={48} />
          <p>Log in to submit your photos</p>
          <Link to="/login" className="contest__modal-btn" onClick={onClose}>
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Submit">
      {submitted ? (
        <div className="contest__submit-success">
          <Check size={48} />
          <p>Your submission has been received!</p>
          <button className="contest__modal-btn" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form className="contest__submit-form" onSubmit={handleSubmit}>
          <div className="contest__submit-limit">
            <span>{remaining} of 3 submissions remaining</span>
          </div>
          {error && <p className="contest__submit-error">{error}</p>}

          <div
            className={`contest__dropzone${dragging ? ' contest__dropzone--active' : ''}${preview ? ' contest__dropzone--has-preview' : ''}${atLimit ? ' contest__dropzone--disabled' : ''}`}
            onClick={() => !atLimit && fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!atLimit) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="contest__dropzone-preview" />
            ) : (
              <div className="contest__dropzone-placeholder">
                <Camera size={32} />
                <p>{atLimit ? 'Submission limit reached' : 'Drag & drop your photo here, or click to browse'}</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="contest__file-input"
              disabled={atLimit}
            />
          </div>

          <label className="contest__form-label">
            <span>Title <span className="contest__required">*</span></span>
            <input
              type="text"
              className="contest__form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your photo a title"
              disabled={atLimit}
            />
          </label>

          <fieldset className="contest__exif-group" disabled={atLimit}>
            <legend>EXIF Data (Optional)</legend>
            <div className="contest__exif-grid">
              <label className="contest__form-label">
                Camera
                <input type="text" className="contest__form-input" value={camera} onChange={(e) => setCamera(e.target.value)} placeholder="e.g. Sony A7III" />
              </label>
              <label className="contest__form-label">
                Focal Length
                <input type="text" className="contest__form-input" value={focalLength} onChange={(e) => setFocalLength(e.target.value)} placeholder="e.g. 35mm" />
              </label>
              <label className="contest__form-label">
                Aperture
                <input type="text" className="contest__form-input" value={aperture} onChange={(e) => setAperture(e.target.value)} placeholder="e.g. f/2.8" />
              </label>
              <label className="contest__form-label">
                Shutter Speed
                <input type="text" className="contest__form-input" value={shutterSpeed} onChange={(e) => setShutterSpeed(e.target.value)} placeholder="e.g. 1/250s" />
              </label>
              <label className="contest__form-label">
                ISO
                <input type="number" className="contest__form-input" value={iso} onChange={(e) => setIso(e.target.value)} placeholder="e.g. 400" />
              </label>
            </div>
          </fieldset>

          <button
            type="submit"
            className="contest__modal-btn contest__modal-btn--submit"
            disabled={!canSubmit || submitting}
          >
            {submitting ? 'Submitting...' : atLimit ? 'Submission Limit Reached' : 'Submit Photo'}
          </button>
          <p className="contest__submit-disclaimer">Submissions cannot be changed once submitted.</p>
        </form>
      )}
    </div>
  );
}

/* --- Tab: Vote (Wizard) --- */

function WizardProgressBar({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <div className="contest__wizard-progress">
      {steps.map((label, i) => (
        <div
          key={label}
          className={`contest__wizard-step${i === currentStep ? ' contest__wizard-step--active' : ''}${i < currentStep ? ' contest__wizard-step--completed' : ''}`}
        >
          <div className="contest__wizard-step-dot">
            {i < currentStep ? <Check size={12} /> : i + 1}
          </div>
          <span className="contest__wizard-step-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function TabVote({
  contest,
  onClose,
  onContestRefresh,
}: {
  contest: Contest;
  onClose: () => void;
  onContestRefresh: () => void;
}) {
  const { isAuthenticated } = useAuth();

  // Determine categories for this contest
  const categories = useMemo<VoteCategory[]>(() => {
    const cats: VoteCategory[] = ['theme', 'favorite'];
    if (contest.wildcardCategory) cats.push('wildcard');
    return cats;
  }, [contest.wildcardCategory]);

  const stepLabels = useMemo(() => {
    return [...categories.map((c) => getCategoryLabel(c, contest.wildcardCategory)), 'Review'];
  }, [categories, contest.wildcardCategory]);

  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<VoteCategory, Set<number>>>(() => ({
    theme: new Set(),
    favorite: new Set(),
    wildcard: new Set(),
  }));
  const [voted, setVoted] = useState(contest.userHasVoted === true);
  const [submittingVote, setSubmittingVote] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const isReviewStep = currentStep === categories.length;
  const currentCategory = isReviewStep ? null : categories[currentStep];

  const toggleSelection = (category: VoteCategory, subId: number) => {
    setSelections((prev) => {
      const s = new Set(prev[category]);
      if (s.has(subId)) {
        s.delete(subId);
      } else if (s.size < 3) {
        s.add(subId);
      }
      return { ...prev, [category]: s };
    });
  };

  const currentSelectionCount = currentCategory ? selections[currentCategory].size : 0;
  const canGoNext = currentCategory ? currentSelectionCount >= 1 : false;

  const handleCastVotes = async () => {
    setSubmittingVote(true);
    setVoteError(null);
    try {
      const votes = categories
        .filter((cat) => selections[cat].size > 0)
        .map((cat) => ({
          category: cat,
          submissionIds: [...selections[cat]],
        }));
      await castVote(contest.id, votes);
      setVoted(true);
      onContestRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to cast votes';
      setVoteError(msg);
    }
    setSubmittingVote(false);
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

  return (
    <div role="tabpanel" aria-label="Vote">
      <WizardProgressBar steps={stepLabels} currentStep={currentStep} />

      {/* Category step */}
      {currentCategory && (
        <>
          <p className="contest__modal-subtitle">
            {getCategoryLabel(currentCategory, contest.wildcardCategory)} — Select up to 3 photos
          </p>
          <div className="contest__wizard-counter">
            {currentSelectionCount} of 3 selected
          </div>
          <div className="contest__vote-grid">
            {contest.submissions.map((sub) => {
              const selected = selections[currentCategory].has(sub.id);
              const maxReached = selections[currentCategory].size >= 3;
              const disabled = !selected && maxReached;
              return (
                <div
                  key={sub.id}
                  className={`contest__vote-thumb${selected ? ' contest__vote-thumb--selected' : ''}${disabled ? ' contest__vote-thumb--disabled' : ''}`}
                  onClick={() => !disabled && toggleSelection(currentCategory, sub.id)}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                      e.preventDefault();
                      toggleSelection(currentCategory, sub.id);
                    }
                  }}
                  tabIndex={disabled ? -1 : 0}
                  role="checkbox"
                  aria-checked={selected}
                  aria-disabled={disabled}
                  aria-label={`${sub.title} by ${sub.photographer}`}
                >
                  <img src={getImageUrl(sub.url, 'thumb')} alt={sub.title} loading="lazy" />
                  {selected && (
                    <div className="contest__vote-check">
                      <Check size={24} />
                    </div>
                  )}
                  <div className="contest__vote-info">
                    <span className="contest__vote-title">{sub.title}</span>
                    <span className="contest__vote-photographer">{sub.photographer}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Review step */}
      {isReviewStep && (
        <div className="contest__wizard-review">
          <p className="contest__modal-subtitle">Review your selections</p>
          {voteError && <p className="contest__submit-error">{voteError}</p>}
          {categories.map((cat) => (
            <div key={cat} className="contest__wizard-review-category">
              <div className="contest__wizard-review-header">
                <span>{getCategoryLabel(cat, contest.wildcardCategory)}</span>
                <button
                  className="contest__wizard-review-edit"
                  onClick={() => setCurrentStep(categories.indexOf(cat))}
                >
                  Edit
                </button>
              </div>
              <div className="contest__wizard-review-photos">
                {[...selections[cat]].map((subId) => {
                  const sub = contest.submissions.find((s) => s.id === subId);
                  if (!sub) return null;
                  return (
                    <div key={subId} className="contest__wizard-review-photo">
                      <img src={getImageUrl(sub.url, 'thumb')} alt={sub.title} />
                      <span>{sub.title}</span>
                    </div>
                  );
                })}
                {selections[cat].size === 0 && (
                  <span className="contest__wizard-review-empty">No selections</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Wizard footer */}
      <div className="contest__wizard-footer">
        <button
          className="contest__modal-btn"
          onClick={() => setCurrentStep((s) => s - 1)}
          disabled={currentStep === 0}
          style={{ opacity: currentStep === 0 ? 0.4 : 1 }}
        >
          Back
        </button>
        {isReviewStep ? (
          <button
            className="contest__modal-btn contest__modal-btn--submit"
            onClick={handleCastVotes}
            disabled={submittingVote}
            style={{ width: 'auto', marginTop: 0 }}
          >
            {submittingVote ? 'Submitting...' : 'Cast Votes'}
          </button>
        ) : (
          <button
            className="contest__modal-btn"
            onClick={() => setCurrentStep((s) => s + 1)}
            disabled={!canGoNext}
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

/* --- Tab: Rules --- */

function TabRules({ contest }: { contest: Contest }) {
  const isVoting = contest.status === 'voting';
  const isActive = contest.status === 'active';

  return (
    <div role="tabpanel" aria-label="Rules">
      {isVoting && (
        <div className="contest__rules-voting-info">
          <h3>How Voting Works</h3>
          <ul className="contest__rules-list">
            <li>
              Vote in {contest.wildcardCategory ? '3' : '2'} categories: Best Addresses the Theme, Personal Favorite{contest.wildcardCategory ? `, and ${contest.wildcardCategory}` : ''}
            </li>
            <li>Select up to 3 photos per category</li>
            <li>Votes are final and cannot be changed</li>
            <li>Voting deadline: {formatDeadline(contest.deadline)}</li>
            <li>Results are revealed after the voting period ends</li>
          </ul>
        </div>
      )}

      {isActive && (
        <div className="contest__rules-voting-info">
          <h3>Submission Info</h3>
          <ul className="contest__rules-list">
            <li>Maximum 3 submissions per person</li>
            <li>Submissions cannot be changed once submitted</li>
            <li>Submission deadline: {formatDeadline(contest.deadline)}</li>
          </ul>
        </div>
      )}

      <h3 className="contest__rules-heading">
        {isVoting ? 'Contest Guidelines' : 'Guidelines'}
      </h3>
      <ul className="contest__rules-list">
        {contest.guidelines.map((g, i) => (
          <li key={i}>{g}</li>
        ))}
      </ul>
    </div>
  );
}

/* --- Tab: Gallery --- */

function TabGallery({ contest }: { contest: Contest }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const expandedSub = expandedId
    ? contest.submissions.find((s) => s.id === expandedId) ?? null
    : null;

  if (expandedSub) {
    const exifStr = formatExif(expandedSub.exif);
    return (
      <div role="tabpanel" aria-label="Gallery">
        <div className="contest__gallery-expanded">
          <button
            className="contest__gallery-back"
            onClick={() => setExpandedId(null)}
          >
            <ArrowLeft size={16} /> Back to gallery
          </button>
          <img
            src={getImageUrl(expandedSub.url, 'medium')}
            alt={expandedSub.title}
            className="contest__gallery-expanded-img"
          />
          <div className="contest__gallery-expanded-info">
            <h3>{expandedSub.title}</h3>
            <p className="contest__gallery-expanded-photographer">
              {expandedSub.photographer}
            </p>
            {exifStr && (
              <p className="contest__gallery-expanded-exif">{exifStr}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="tabpanel" aria-label="Gallery">
      <div className="contest__gallery-grid">
        {contest.submissions.map((sub) => (
          <div
            key={sub.id}
            className="contest__gallery-item"
            onClick={() => setExpandedId(sub.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpandedId(sub.id);
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`View ${sub.title} by ${sub.photographer}`}
          >
            <img
              src={getImageUrl(sub.url, 'medium')}
              alt={sub.title}
              loading="lazy"
            />
            <div className="contest__gallery-item-overlay">
              <span className="contest__gallery-item-title">{sub.title}</span>
              <span className="contest__gallery-item-photographer">{sub.photographer}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --- Tab: Podium (Carousel) --- */

function TabPodium({ contest }: { contest: Contest }) {
  const categories = useMemo<VoteCategory[]>(() => {
    if (!contest.winners) return [];
    const cats = new Set<VoteCategory>();
    for (const w of contest.winners) {
      cats.add((w.category || 'theme') as VoteCategory);
    }
    return [...cats];
  }, [contest.winners]);

  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-rotate
  useEffect(() => {
    if (categories.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveSlide((s) => (s + 1) % categories.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [categories.length, isPaused]);

  const trophyColor = (place: number) => {
    if (place === 1) return '#FFD700';
    if (place === 2) return '#C0C0C0';
    return '#CD7F32';
  };

  const placeLabel = (place: number) => {
    if (place === 1) return '1st Place';
    if (place === 2) return '2nd Place';
    return '3rd Place';
  };

  if (categories.length === 0) {
    return (
      <div role="tabpanel" aria-label="Podium">
        <p className="contest__modal-subtitle">No winners have been announced yet.</p>
      </div>
    );
  }

  const currentCat = categories[activeSlide];
  const winnersForCat = (contest.winners || [])
    .filter((w) => (w.category || 'theme') === currentCat)
    .sort((a, b) => a.place - b.place)
    .map((w) => {
      const sub = contest.submissions.find((s) => s.id === w.submissionId);
      return sub ? { ...sub, place: w.place } : null;
    })
    .filter((x): x is ContestSubmission & { place: 1 | 2 | 3 } => x !== null);

  const mentionsForCat = (contest.honorableMentions || [])
    .filter((hm) => (hm.category || 'theme') === currentCat)
    .map((hm) => contest.submissions.find((s) => s.id === hm.submissionId))
    .filter((x): x is ContestSubmission => x !== undefined);

  return (
    <div
      role="tabpanel"
      aria-label="Podium"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="contest__carousel">
        {categories.length > 1 && (
          <button
            className="contest__carousel-arrow contest__carousel-arrow--left"
            onClick={() => setActiveSlide((s) => (s - 1 + categories.length) % categories.length)}
            aria-label="Previous category"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        <div className="contest__carousel-slide contest__carousel-slide--active">
          <h3 className="contest__carousel-category-label">
            {getCategoryLabel(currentCat, contest.wildcardCategory)}
          </h3>

          <div className="contest__podium-stage">
            {winnersForCat.map((p) => (
              <div
                key={p.id}
                className={`contest__podium-place contest__podium-place--${p.place}`}
              >
                <div className="contest__podium-photo">
                  <img src={getImageUrl(p.url, 'thumb')} alt={p.title} />
                </div>
                <Trophy size={24} color={trophyColor(p.place)} />
                <span className="contest__podium-label" style={{ color: trophyColor(p.place) }}>
                  {placeLabel(p.place)}
                </span>
                <span className="contest__podium-title">{p.title}</span>
                <span className="contest__podium-photographer">{p.photographer}</span>
                <span className="contest__podium-votes">{p.votes ?? 0} votes</span>
              </div>
            ))}
          </div>

          {mentionsForCat.length > 0 && (
            <div className="contest__podium-mentions">
              <h3 className="contest__podium-mentions-heading">Honorable Mentions</h3>
              <div className="contest__podium-mentions-grid">
                {mentionsForCat.map((m) => (
                  <div key={m.id} className="contest__podium-mention-card">
                    <img src={getImageUrl(m.url, 'thumb')} alt={m.title} />
                    <div className="contest__podium-mention-info">
                      <span className="contest__podium-mention-title">{m.title}</span>
                      <span className="contest__podium-mention-photographer">{m.photographer}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {categories.length > 1 && (
          <button
            className="contest__carousel-arrow contest__carousel-arrow--right"
            onClick={() => setActiveSlide((s) => (s + 1) % categories.length)}
            aria-label="Next category"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <div className="contest__carousel-dots">
          {categories.map((cat, i) => (
            <button
              key={cat}
              className={`contest__carousel-dot${i === activeSlide ? ' contest__carousel-dot--active' : ''}`}
              onClick={() => setActiveSlide(i)}
            >
              {getCategoryLabel(cat, contest.wildcardCategory)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* --- Tab: Full Results --- */

function TabFullResults({ contest }: { contest: Contest }) {
  const categories = useMemo<VoteCategory[]>(() => {
    const cats: VoteCategory[] = ['theme', 'favorite'];
    if (contest.wildcardCategory) cats.push('wildcard');
    return cats;
  }, [contest.wildcardCategory]);

  const [selectedCategory, setSelectedCategory] = useState<VoteCategory>(categories[0]);

  const ranked = useMemo(() => {
    return [...contest.submissions]
      .sort((a, b) => {
        const aVotes = a.categoryVotes ? a.categoryVotes[selectedCategory] : (a.votes ?? 0);
        const bVotes = b.categoryVotes ? b.categoryVotes[selectedCategory] : (b.votes ?? 0);
        return bVotes - aVotes;
      })
      .slice(0, 10);
  }, [contest.submissions, selectedCategory]);

  const stats = useMemo(() => {
    let totalVotes = 0;
    for (const s of contest.submissions) {
      totalVotes += s.categoryVotes ? s.categoryVotes[selectedCategory] : (s.votes ?? 0);
    }
    const avgVotes = contest.submissions.length > 0
      ? (totalVotes / contest.submissions.length).toFixed(1)
      : '0';
    const uniquePhotographers = new Set(contest.submissions.map((s) => s.photographer)).size;
    return { totalVotes, avgVotes, uniquePhotographers };
  }, [contest.submissions, selectedCategory]);

  const getVotesForSub = (sub: ContestSubmission) => {
    return sub.categoryVotes ? sub.categoryVotes[selectedCategory] : (sub.votes ?? 0);
  };

  const medalColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return undefined;
  };

  return (
    <div role="tabpanel" aria-label="Full Results">
      <div className="contest__category-pills">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`contest__category-pill${cat === selectedCategory ? ' contest__category-pill--active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {getCategoryLabel(cat, contest.wildcardCategory)}
          </button>
        ))}
      </div>

      <div className="contest__results-list">
        {ranked.map((sub, i) => {
          const rank = i + 1;
          const color = medalColor(rank);
          return (
            <div
              key={sub.id}
              className={`contest__results-row${rank <= 3 ? ' contest__results-row--medal' : ''}`}
              style={color ? { borderLeftColor: color } : undefined}
            >
              <span
                className="contest__results-rank"
                style={color ? { color } : undefined}
              >
                {rank}
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
              </div>
              <span className="contest__results-votes">{getVotesForSub(sub)} votes</span>
            </div>
          );
        })}
      </div>

      <div className="contest__results-stats">
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.totalVotes}</span>
          <span className="contest__results-stat-label">Total Votes</span>
        </div>
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.avgVotes}</span>
          <span className="contest__results-stat-label">Avg Votes / Photo</span>
        </div>
        <div className="contest__results-stat">
          <span className="contest__results-stat-value">{stats.uniquePhotographers}</span>
          <span className="contest__results-stat-label">Unique Photographers</span>
        </div>
      </div>
    </div>
  );
}

/* --- Contest Modal (unified) --- */

function ContestModal({
  contest,
  onClose,
  onContestRefresh,
}: {
  contest: Contest;
  onClose: () => void;
  onContestRefresh: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const tabs = TABS_BY_STATUS[contest.status];
  const refTab = HEIGHT_REF_TAB[contest.status];
  const [activeTab, setActiveTab] = useState<TabId>(refTab);

  // Lifted submission form state
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [camera, setCamera] = useState('');
  const [focalLength, setFocalLength] = useState('');
  const [aperture, setAperture] = useState('');
  const [shutterSpeed, setShutterSpeed] = useState('');
  const [iso, setIso] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const tabContentRef = useRef<HTMLDivElement>(null);
  const [lockedHeight, setLockedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (lockedHeight === null && tabContentRef.current) {
      setLockedHeight(tabContentRef.current.offsetHeight);
      if (refTab !== tabs[0].id) {
        setActiveTab(tabs[0].id);
      }
    }
  }, []);

  const modalTitle =
    contest.status === 'active'
      ? `Submit to "${contest.theme}"`
      : contest.status === 'voting'
        ? `Vote — "${contest.theme}"`
        : `Results — "${contest.theme}"`;

  return (
    <ModalShell open ariaLabel={modalTitle} onClose={onClose}>
      <h2 className="contest__modal-title">
        {contest.status === 'completed' && <Trophy size={22} />}
        {modalTitle}
      </h2>

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} isAuthenticated={isAuthenticated} />

      <div
        className="contest__tab-content"
        key={activeTab}
        ref={tabContentRef}
        style={lockedHeight !== null ? { height: lockedHeight, flex: 'none' } : undefined}
      >
        {activeTab === 'submit' && (
          <TabSubmit
            contest={contest}
            onClose={onClose}
            file={file}
            setFile={setFile}
            title={title}
            setTitle={setTitle}
            camera={camera}
            setCamera={setCamera}
            focalLength={focalLength}
            setFocalLength={setFocalLength}
            aperture={aperture}
            setAperture={setAperture}
            shutterSpeed={shutterSpeed}
            setShutterSpeed={setShutterSpeed}
            iso={iso}
            setIso={setIso}
            submitted={submitted}
            setSubmitted={setSubmitted}
            onContestRefresh={onContestRefresh}
          />
        )}
        {activeTab === 'vote' && (
          <TabVote
            contest={contest}
            onClose={onClose}
            onContestRefresh={onContestRefresh}
          />
        )}
        {activeTab === 'rules' && <TabRules contest={contest} />}
        {activeTab === 'gallery' && <TabGallery contest={contest} />}
        {activeTab === 'podium' && <TabPodium contest={contest} />}
        {activeTab === 'full-results' && <TabFullResults contest={contest} />}
      </div>
    </ModalShell>
  );
}

/* --- Contest Card --- */

function ContestCard({
  contest,
  onClick,
}: {
  contest: Contest;
  onClick: () => void;
}) {
  const statusLabel =
    contest.status === 'active'
      ? 'Open for Submissions'
      : contest.status === 'voting'
        ? 'Voting in Progress'
        : 'Completed';

  return (
    <div
      className="contest__card fade-in-up"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      role="button"
      aria-label={`${contest.theme} — ${statusLabel}`}
    >
      <div className="contest__card-header">
        <span className={`contest__status contest__status--${contest.status}`}>
          {statusLabel}
        </span>
        <h2>{contest.theme}</h2>
        <p className="contest__card-month">{contest.month}</p>
        <p className="contest__card-desc">{contest.description}</p>
      </div>

      <div className="contest__card-stats">
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
    </div>
  );
}

/* --- Main Contest Page --- */

export default function ContestPage() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [openModal, setOpenModal] = useState<{ contestId: number } | null>(null);
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    getContests()
      .then((data) => {
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useScrollReveal();

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((v) => v + BATCH_SIZE);
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading]);

  const activeContest = contests.find((c) => c.status === 'active') ?? contests[0];
  const visibleContests = contests.slice(0, visibleCount);
  const modalContest = openModal ? contests.find((c) => c.id === openModal.contestId) : null;

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

  if (error || contests.length === 0) {
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
      {/* Hero Banner */}
      <div className="contest-page__hero">
        <div className="contest-page__hero-bg">
          <img
            src={getImageUrl(activeContest?.submissions[0]?.url ?? 'https://picsum.photos/seed/contest-hero/1600/600', 'full')}
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
        {/* Contest Cards */}
        <div className="contest__cards">
          {visibleContests.map((c) => (
            <ContestCard
              key={c.id}
              contest={c}
              onClick={() => setOpenModal({ contestId: c.id })}
            />
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        {visibleCount < contests.length && (
          <div ref={sentinelRef} className="contest__sentinel" />
        )}
      </div>

      <Footer />

      {/* Modal */}
      {modalContest && (
        <ContestModal
          contest={modalContest}
          onClose={() => setOpenModal(null)}
          onContestRefresh={loadData}
        />
      )}
    </div>
  );
}
