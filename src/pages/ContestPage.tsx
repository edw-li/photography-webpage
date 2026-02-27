import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Camera, Users, Check, Trophy } from 'lucide-react';
import type { Contest, ContestSubmission } from '../types/contest';
import { useScrollReveal } from '../hooks/useScrollReveal';
import Footer from '../components/Footer';
import './ContestPage.css';

const BATCH_SIZE = 5;

function formatDeadline(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ─── Shared Modal Shell ─── */

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

/* ─── Contest Card ─── */

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

/* ─── Submission Modal (Active) ─── */

function SubmissionModal({
  contest,
  onClose,
}: {
  contest: Contest;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<{ name: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [camera, setCamera] = useState('');
  const [focalLength, setFocalLength] = useState('');
  const [aperture, setAperture] = useState('');
  const [shutterSpeed, setShutterSpeed] = useState('');
  const [iso, setIso] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    import('../data/members.json').then((mod) => {
      const data = (mod.default ?? mod) as { members: { name: string }[] };
      setMembers(data.members);
    });
  }, []);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const canSubmit = file !== null && title.trim() !== '' && author !== '';

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) setFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitted(true);
  };

  return (
    <ModalShell open ariaLabel={`Submit to ${contest.theme}`} onClose={onClose}>
      <h2 className="contest__modal-title">Submit to "{contest.theme}"</h2>

      {submitted ? (
        <div className="contest__submit-success">
          <Check size={48} />
          <p>Your submission has been received!</p>
          <button className="contest__modal-btn" onClick={onClose}>Close</button>
        </div>
      ) : (
        <form className="contest__submit-form" onSubmit={handleSubmit}>
          {/* Drag-drop zone */}
          <div
            className={`contest__dropzone${dragging ? ' contest__dropzone--active' : ''}${preview ? ' contest__dropzone--has-preview' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="contest__dropzone-preview" />
            ) : (
              <div className="contest__dropzone-placeholder">
                <Camera size={32} />
                <p>Drag & drop your photo here, or click to browse</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="contest__file-input"
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
            />
          </label>

          <label className="contest__form-label">
            <span>Author <span className="contest__required">*</span></span>
            <select
              className="contest__form-input contest__form-select"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
            >
              <option value="">Select a member</option>
              {members.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </select>
          </label>

          <fieldset className="contest__exif-group">
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
            disabled={!canSubmit}
          >
            Submit Photo
          </button>
        </form>
      )}
    </ModalShell>
  );
}

/* ─── Voting Ballot Modal (Voting) ─── */

function VotingModal({
  contest,
  onClose,
}: {
  contest: Contest;
  onClose: () => void;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [voted, setVoted] = useState(false);

  const handleVote = () => {
    if (selectedId === null) return;
    setVoted(true);
  };

  return (
    <ModalShell open ariaLabel={`Vote on ${contest.theme}`} onClose={onClose}>
      <h2 className="contest__modal-title">Vote — "{contest.theme}"</h2>

      {voted ? (
        <div className="contest__submit-success">
          <Check size={48} />
          <p>Your vote has been cast!</p>
          <button className="contest__modal-btn" onClick={onClose}>Close</button>
        </div>
      ) : (
        <>
          <p className="contest__modal-subtitle">Select your favorite photo, then cast your vote.</p>
          <div className="contest__vote-grid">
            {contest.submissions.map((sub) => (
              <div
                key={sub.id}
                className={`contest__vote-thumb${selectedId === sub.id ? ' contest__vote-thumb--selected' : ''}`}
                onClick={() => setSelectedId(sub.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(sub.id); } }}
                tabIndex={0}
                role="radio"
                aria-checked={selectedId === sub.id}
                aria-label={`${sub.title} by ${sub.photographer}`}
              >
                <img src={`${sub.url}/300/200`} alt={sub.title} loading="lazy" />
                {selectedId === sub.id && (
                  <div className="contest__vote-check">
                    <Check size={24} />
                  </div>
                )}
                <div className="contest__vote-info">
                  <span className="contest__vote-title">{sub.title}</span>
                  <span className="contest__vote-photographer">{sub.photographer}</span>
                </div>
              </div>
            ))}
          </div>
          <button
            className="contest__modal-btn contest__modal-btn--submit"
            disabled={selectedId === null}
            onClick={handleVote}
          >
            Cast Vote
          </button>
        </>
      )}
    </ModalShell>
  );
}

/* ─── Results Modal (Completed) ─── */

function ResultsModal({
  contest,
  onClose,
}: {
  contest: Contest;
  onClose: () => void;
}) {
  const ranked = useMemo(() => {
    return [...contest.submissions]
      .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
      .slice(0, 10);
  }, [contest.submissions]);

  const medalColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return undefined;
  };

  return (
    <ModalShell open ariaLabel={`Results for ${contest.theme}`} onClose={onClose}>
      <h2 className="contest__modal-title">
        <Trophy size={22} /> Final Results — "{contest.theme}"
      </h2>

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
                src={`${sub.url}/80/60`}
                alt={sub.title}
                loading="lazy"
              />
              <div className="contest__results-info">
                <span className="contest__results-name">{sub.title}</span>
                <span className="contest__results-photographer">{sub.photographer}</span>
              </div>
              <span className="contest__results-votes">{sub.votes ?? 0} votes</span>
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}

/* ─── Main Contest Page ─── */

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
        {/* ── Contest Cards ── */}
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

      {/* ── Modals ── */}
      {modalContest?.status === 'active' && (
        <SubmissionModal
          contest={modalContest}
          onClose={() => setOpenModal(null)}
        />
      )}
      {modalContest?.status === 'voting' && (
        <VotingModal
          contest={modalContest}
          onClose={() => setOpenModal(null)}
        />
      )}
      {modalContest?.status === 'completed' && (
        <ResultsModal
          contest={modalContest}
          onClose={() => setOpenModal(null)}
        />
      )}
    </div>
  );
}
