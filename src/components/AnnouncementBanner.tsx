import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  dismissAnnouncement,
  getActiveAnnouncement,
} from '../api/announcements';
import type {
  ActiveAnnouncement,
  AnnouncementSeverity,
} from '../types/announcement';
import {
  addLocalDismissal,
  getLocalDismissal,
  removeLocalDismissal,
} from '../utils/dismissedAnnouncements';
import './AnnouncementBanner.css';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function severityIcon(severity: AnnouncementSeverity) {
  if (severity === 'critical') return <AlertOctagon size={18} aria-hidden />;
  if (severity === 'warning') return <AlertTriangle size={18} aria-hidden />;
  return <Info size={18} aria-hidden />;
}

export default function AnnouncementBanner() {
  const { isAuthenticated, user } = useAuth();
  const [announcement, setAnnouncement] = useState<ActiveAnnouncement | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const fetchActive = useCallback(async () => {
    try {
      const a = await getActiveAnnouncement();
      if (!a) {
        setAnnouncement(null);
        return;
      }
      // Non-dismissable banners override prior local dismissals — admin
      // explicitly wants force-visibility. Show without checking localStorage.
      if (!a.isDismissable) {
        setAnnouncement(a);
        return;
      }
      const local = getLocalDismissal(a.id);
      if (!local) {
        setAnnouncement(a);
        return;
      }
      // If the admin reset dismissals AFTER this device's dismissal, the
      // local entry is stale — show the banner and clean up the entry so
      // we don't keep doing this comparison on every fetch.
      const serverReset = a.dismissalsResetAt ? Date.parse(a.dismissalsResetAt) : null;
      const localAt = Date.parse(local.at);
      if (serverReset !== null && !Number.isNaN(localAt) && localAt < serverReset) {
        removeLocalDismissal(a.id);
        setAnnouncement(a);
        return;
      }
      // Local dismissal is current — keep banner hidden.
      setAnnouncement(null);
    } catch {
      // Fail-soft: never break the page over a missing banner.
      setAnnouncement(null);
    }
  }, []);

  // Fetch on mount + whenever auth state flips. user?.id catches account switches.
  useEffect(() => {
    fetchActive();
  }, [fetchActive, isAuthenticated, user?.id]);

  // Periodic refresh so long-lived sessions pick up new banners or schedule changes.
  useEffect(() => {
    const id = window.setInterval(fetchActive, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [fetchActive]);

  // Toggle a body class so other components (Navbar) can react to banner presence.
  // Declarative .toggle() avoids race conditions from queued cleanup-then-add
  // sequences when announcement flips quickly. Final cleanup ensures the class
  // is removed if the banner unmounts entirely (e.g., full app teardown).
  useEffect(() => {
    document.body.classList.toggle('has-announcement-banner', announcement !== null);
    return () => {
      document.body.classList.remove('has-announcement-banner');
    };
  }, [announcement]);

  if (!announcement) return null;

  const handleDismiss = async () => {
    if (!announcement.isDismissable || dismissing) return;
    setDismissing(true);
    // Update localStorage immediately as a backstop in case the API call fails
    // or the user is anonymous; banner won't reappear on refresh either way.
    addLocalDismissal(announcement.id);
    if (isAuthenticated) {
      try {
        await dismissAnnouncement(announcement.id);
      } catch {
        // Non-fatal — localStorage already prevents reappearance for this device.
      }
    }
    // Move focus to the first focusable element in the navbar so keyboard users
    // don't lose their place when the close button unmounts.
    const navTarget = document.querySelector<HTMLElement>(
      '.navbar a, .navbar button',
    );
    navTarget?.focus({ preventScroll: true });
    // Unmount last; setDismissing(false) is intentionally omitted because the
    // component is about to unmount and the state would be discarded anyway.
    setAnnouncement(null);
  };

  const ctaIsExternal = announcement.ctaUrl
    ? isExternalUrl(announcement.ctaUrl)
    : false;

  return (
    <div
      className={`announcement-banner announcement-banner--${announcement.severity}`}
      role={announcement.severity === 'critical' ? 'alert' : 'status'}
      aria-live={announcement.severity === 'critical' ? 'assertive' : 'polite'}
    >
      <div className="announcement-banner__inner">
        <span className="announcement-banner__icon">
          {severityIcon(announcement.severity)}
        </span>
        <div className="announcement-banner__content">
          <strong className="announcement-banner__title">{announcement.title}</strong>
          <span
            className="announcement-banner__body"
            dangerouslySetInnerHTML={{ __html: announcement.html }}
          />
        </div>
        {announcement.ctaLabel && announcement.ctaUrl && (
          ctaIsExternal ? (
            <a
              className="announcement-banner__cta"
              href={announcement.ctaUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {announcement.ctaLabel}
            </a>
          ) : (
            <Link
              className="announcement-banner__cta"
              to={announcement.ctaUrl}
            >
              {announcement.ctaLabel}
            </Link>
          )
        )}
        {announcement.isDismissable && (
          <button
            type="button"
            className="announcement-banner__close"
            onClick={handleDismiss}
            disabled={dismissing}
            aria-label="Dismiss announcement"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
