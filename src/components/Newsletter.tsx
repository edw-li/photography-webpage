import { useState, useEffect, useMemo, useCallback, useRef, type FormEvent } from 'react';
import type { Newsletter as NewsletterType } from '../types/newsletter';
import { parseNewsletter } from '../utils/parseNewsletter';
import './Newsletter.css';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
}

const modules = import.meta.glob('../newsletters/*.md', {
  query: '?raw',
  import: 'default',
});

/* ─── Modal ─── */

function NewsletterModal({
  newsletter,
  onClose,
}: {
  newsletter: NewsletterType | null;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const beginClose = useCallback(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) { onClose(); return; }
    setClosing(true);
  }, [onClose]);

  useEffect(() => {
    if (!newsletter) return;
    setClosing(false);
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beginClose();
      if (e.key === 'Tab') {
        // Simple focus trap: keep focus on close button
        e.preventDefault();
        closeRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [newsletter, beginClose]);

  if (!newsletter) return null;

  return (
    <div
      className={`newsletter__modal-backdrop${closing ? ' newsletter__modal-backdrop--closing' : ''}`}
      onClick={beginClose}
      onAnimationEnd={() => { if (closing) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={newsletter.title}
    >
      <div className="newsletter__modal" onClick={(e) => e.stopPropagation()}>
        <button
          ref={closeRef}
          className="newsletter__modal-close"
          onClick={beginClose}
          aria-label="Close"
        >
          &times;
        </button>

        <div className="newsletter__modal-header">
          <span className="newsletter__category-tag">{newsletter.category}</span>
          <h3>{newsletter.title}</h3>
          <p className="newsletter__modal-meta">
            {formatDate(newsletter.date)}
            {newsletter.author && ` · by ${newsletter.author}`}
          </p>
        </div>

        <div
          className="newsletter__modal-body"
          dangerouslySetInnerHTML={{ __html: newsletter.html }}
        />
      </div>
    </div>
  );
}

/* ─── Main Section ─── */

export default function Newsletter() {
  const [newsletters, setNewsletters] = useState<NewsletterType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedNewsletter, setSelectedNewsletter] = useState<NewsletterType | null>(null);
  const [filterAnimPhase, setFilterAnimPhase] = useState<'exit' | 'enter' | null>(null);
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);
  const [filterVersion, setFilterVersion] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const entries = Object.entries(modules);
      const parsed = await Promise.all(
        entries.map(async ([path, loader]) => {
          const raw = (await loader()) as string;
          return parseNewsletter(path, raw);
        })
      );
      parsed.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
      setNewsletters(parsed);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const categories = useMemo(
    () => [...new Set(newsletters.map((n) => n.category))],
    [newsletters]
  );

  const filteredNewsletters = useMemo(() => {
    if (!activeFilter) return newsletters;
    return newsletters.filter((n) => n.category === activeFilter);
  }, [newsletters, activeFilter]);

  const featuredNewsletter = useMemo(
    () => newsletters.find((n) => n.featured) ?? newsletters[0] ?? null,
    [newsletters]
  );

  const archiveNewsletters = useMemo(
    () => filteredNewsletters.filter((n) => n !== featuredNewsletter),
    [filteredNewsletters, featuredNewsletter]
  );

  const handleFilterChange = (category: string | null) => {
    if (category === activeFilter || filterAnimPhase) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setActiveFilter(category);
      setFilterVersion((v) => v + 1);
      return;
    }
    setPendingFilter(category);
    setFilterAnimPhase('exit');
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <section id="newsletter" className="newsletter section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Newsletter</h2>
          <p>Stay in the loop with club news, tips, and member achievements</p>
        </div>

        {loading && (
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        )}

        {error && (
          <div className="section-error">
            <p>Something went wrong loading newsletters.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Featured Newsletter ── */}
            {featuredNewsletter && (
              <div
                className="newsletter__featured fade-in-up"
                onClick={() => setSelectedNewsletter(featuredNewsletter)}
              >
                <div className="newsletter__featured-badge">Latest</div>
                <div className="newsletter__featured-content">
                  <span className="newsletter__category-tag">
                    {featuredNewsletter.category}
                  </span>
                  <h3>{featuredNewsletter.title}</h3>
                  <p className="newsletter__featured-meta">
                    {formatDate(featuredNewsletter.date)}
                    {featuredNewsletter.author && ` · by ${featuredNewsletter.author}`}
                  </p>
                  <p className="newsletter__featured-preview">
                    {featuredNewsletter.preview}
                  </p>
                  <span className="newsletter__read-more">Read more &rarr;</span>
                </div>
              </div>
            )}

            {/* ── Filter Pills ── */}
            {categories.length > 1 && (
              <div className="newsletter__filters fade-in-up" role="group" aria-label="Filter by category">
                <button
                  className={`newsletter__filter-pill${activeFilter === null ? ' newsletter__filter-pill--active' : ''}`}
                  onClick={() => handleFilterChange(null)}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    className={`newsletter__filter-pill${activeFilter === cat ? ' newsletter__filter-pill--active' : ''}`}
                    onClick={() => handleFilterChange(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* ── Archive Grid ── */}
            <div className="newsletter__grid-wrapper fade-in-up">
            <div
              className={[
                'newsletter__grid',
                filterAnimPhase === 'exit' && 'newsletter__grid--filter-exit',
                filterAnimPhase === 'enter' && 'newsletter__grid--filter-enter',
              ].filter(Boolean).join(' ')}
              key={filterVersion}
              onAnimationEnd={(e) => {
                if (e.target !== e.currentTarget) return;
                if (filterAnimPhase === 'exit') {
                  setActiveFilter(pendingFilter);
                  setFilterVersion((v) => v + 1);
                  setFilterAnimPhase('enter');
                } else if (filterAnimPhase === 'enter') {
                  setFilterAnimPhase(null);
                }
              }}
            >
              {archiveNewsletters.map((nl) => (
                <article
                  key={nl.id}
                  className="newsletter__card"
                  onClick={() => setSelectedNewsletter(nl)}
                >
                  <div className="newsletter__card-header">
                    <span className="newsletter__category-tag">{nl.category}</span>
                    <time className="newsletter__card-date">{formatDate(nl.date)}</time>
                  </div>
                  <h3 className="newsletter__card-title">{nl.title}</h3>
                  <p className="newsletter__card-preview">{nl.preview}</p>
                  <div className="newsletter__card-footer">
                    {nl.author && (
                      <span className="newsletter__card-author">by {nl.author}</span>
                    )}
                    <span className="newsletter__read-more">Read more &rarr;</span>
                  </div>
                </article>
              ))}
              {archiveNewsletters.length === 0 && (
                <p className="newsletter__empty">No newsletters in this category yet.</p>
              )}
            </div>
            </div>

            {/* ── Signup ── */}
            <div className="newsletter__signup fade-in-up">
              <div className="newsletter__signup-content">
                <h3>Subscribe to Our Newsletter</h3>
                <p>Get club updates, photography tips, and challenge announcements delivered to your inbox.</p>
              </div>
              <form className="newsletter__signup-form" onSubmit={handleSubmit}>
                <input
                  type="text"
                  placeholder="Your name"
                  aria-label="Name"
                  className="newsletter__signup-input"
                />
                <input
                  type="email"
                  placeholder="you@example.com"
                  aria-label="Email"
                  className="newsletter__signup-input"
                />
                <button type="submit" className="btn btn-primary newsletter__signup-btn">
                  Subscribe
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      <NewsletterModal
        key={selectedNewsletter?.id}
        newsletter={selectedNewsletter}
        onClose={() => setSelectedNewsletter(null)}
      />
    </section>
  );
}
