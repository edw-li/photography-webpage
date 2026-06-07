import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { ChevronDown } from 'lucide-react';
import { getReleaseNotes } from '../api/releaseNotes';
import type { ReleaseNote } from '../types/releaseNotes';
import Footer from '../components/Footer';
import './ReleaseNotesPage.css';

function formatDate(dateStr: string): string {
  // Parse as local midnight to avoid the UTC off-by-one on "YYYY-MM-DD".
  const d = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function ReleaseNotesPage() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getReleaseNotes();
      setNotes(data.items);
      // Open the latest release by default for quick scanning.
      setExpanded(new Set(data.items.length > 0 ? [data.items[0].id] : []));
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="release-notes-page">
      <div className="release-notes-page__hero">
        <div className="release-notes-page__hero-content">
          <h1>Release Notes</h1>
          <p>What's new on the site — newest releases first.</p>
        </div>
      </div>

      <div className="container release-notes-page__content">
        {loading && (
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        )}

        {error && (
          <div className="section-error">
            <p>Something went wrong loading release notes.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && notes.length === 0 && (
          <p className="release-notes-page__empty">No release notes yet. Check back soon!</p>
        )}

        {!loading && !error && notes.length > 0 && (
          <div className="release-notes-list">
            {notes.map((note) => {
              const isOpen = expanded.has(note.id);
              return (
                <div
                  key={note.id}
                  className={`release-note${isOpen ? ' release-note--open' : ''}`}
                >
                  <h2 className="release-note__heading">
                    <button
                      type="button"
                      className="release-note__toggle"
                      aria-expanded={isOpen}
                      aria-controls={`release-note-body-${note.id}`}
                      onClick={() => toggle(note.id)}
                    >
                      <span className="release-note__version">{note.version}</span>
                      <time className="release-note__date">{formatDate(note.date)}</time>
                      <ChevronDown className="release-note__chevron" size={20} aria-hidden="true" />
                    </button>
                  </h2>
                  {isOpen && (
                    <div
                      id={`release-note-body-${note.id}`}
                      className="release-note__body"
                      role="region"
                      aria-label={`${note.version} details`}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(note.html) }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}
