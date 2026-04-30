import { useCallback, useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  getAnnouncements,
  resetAnnouncementDismissals,
  toggleAnnouncementActive,
  updateAnnouncement,
} from '../../api/announcements';
import type {
  Announcement,
  AnnouncementAudience,
  AnnouncementSeverity,
  AnnouncementStatus,
} from '../../types/announcement';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import Pagination from './Pagination';

const md = new MarkdownIt({ html: false, breaks: false });

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  public: 'Everyone',
  authenticated: 'Logged-in members',
  admin: 'Admins only',
};

const SEVERITY_LABELS: Record<AnnouncementSeverity, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

interface FormState {
  id: string;
  title: string;
  bodyMd: string;
  severity: AnnouncementSeverity;
  audience: AnnouncementAudience;
  priority: number;
  isDismissable: boolean;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string; // datetime-local string or empty
  endsAt: string;
  isActive: boolean;
}

const emptyForm: FormState = {
  id: '',
  title: '',
  bodyMd: '',
  severity: 'info',
  audience: 'public',
  priority: 0,
  isDismissable: true,
  ctaLabel: '',
  ctaUrl: '',
  startsAt: '',
  endsAt: '',
  isActive: true,
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

/**
 * datetime-local input gives us a string like "2026-05-15T14:30" with no
 * timezone — interpreted as local. Convert to a UTC ISO string for the API.
 * Returns null for empty strings.
 */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Convert an ISO timestamp back to the datetime-local input format,
 * preserving the user's local timezone for display.
 */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isValidCtaUrl(url: string): boolean {
  if (!url) return true; // empty is fine when ctaLabel is also empty (handled separately)
  // Match server-side regex: reject protocol-relative `//evil.com` and `/\evil.com`.
  return /^(https?:\/\/|\/(?![/\\]))/i.test(url);
}

function deriveStatus(a: Announcement): AnnouncementStatus {
  if (!a.isActive) return 'inactive';
  const now = new Date();
  if (a.startsAt && new Date(a.startsAt) > now) return 'scheduled';
  if (a.endsAt && new Date(a.endsAt) <= now) return 'ended';
  return 'active';
}

const STATUS_BADGE: Record<AnnouncementStatus, string> = {
  active: 'admin__badge admin__badge--success',
  scheduled: 'admin__badge admin__badge--member',
  ended: 'admin__badge',
  inactive: 'admin__badge',
};

export default function AnnouncementsSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [statusFilter, setStatusFilter] = useState<AnnouncementStatus | ''>('');
  const [audienceFilter, setAudienceFilter] = useState<AnnouncementAudience | ''>('');
  const [severityFilter, setSeverityFilter] = useState<AnnouncementSeverity | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [initialForm, setInitialForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetTarget, setResetTarget] = useState<Announcement | null>(null);
  const [resetting, setResetting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getAnnouncements(p, pageSize, {
        status: statusFilter || undefined,
        audience: audienceFilter || undefined,
        severity: severityFilter || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load announcements');
    }
    setLoading(false);
  }, [addToast, statusFilter, audienceFilter, severityFilter]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  // Reset to page 1 whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [statusFilter, audienceFilter, severityFilter]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = async (a: Announcement) => {
    try {
      const full = await getAnnouncement(a.id);
      const init: FormState = {
        id: full.id,
        title: full.title,
        bodyMd: full.bodyMd,
        severity: full.severity,
        audience: full.audience,
        priority: full.priority,
        isDismissable: full.isDismissable,
        ctaLabel: full.ctaLabel ?? '',
        ctaUrl: full.ctaUrl ?? '',
        startsAt: isoToLocalInput(full.startsAt),
        endsAt: isoToLocalInput(full.endsAt),
        isActive: full.isActive,
      };
      setEditingId(full.id);
      setForm(init);
      setInitialForm(init);
      setShowForm(true);
    } catch {
      addToast('error', 'Failed to load announcement');
    }
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Title is required';
    if (form.title.length > 300) return 'Title must be 300 characters or fewer';
    if (!form.bodyMd.trim()) return 'Body is required';
    if (form.bodyMd.length > 2000) return 'Body must be 2000 characters or fewer';
    if (Boolean(form.ctaLabel.trim()) !== Boolean(form.ctaUrl.trim())) {
      return 'Provide both CTA label and URL, or leave both empty';
    }
    if (form.ctaUrl && !isValidCtaUrl(form.ctaUrl)) {
      return 'CTA URL must start with http://, https://, or /';
    }
    if (form.startsAt && form.endsAt) {
      const s = new Date(form.startsAt).getTime();
      const e = new Date(form.endsAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e <= s) {
        return 'End time must be after start time';
      }
    }
    if (!editingId) {
      const id = form.id.trim() || slugify(form.title);
      if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
        return 'ID must contain only lowercase letters, digits, and hyphens';
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      addToast('error', err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        bodyMd: form.bodyMd,
        severity: form.severity,
        audience: form.audience,
        priority: form.priority,
        isDismissable: form.isDismissable,
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        startsAt: localInputToIso(form.startsAt),
        endsAt: localInputToIso(form.endsAt),
        isActive: form.isActive,
      };
      if (editingId) {
        await updateAnnouncement(editingId, payload);
        addToast('success', 'Announcement updated');
      } else {
        const id = form.id.trim() || slugify(form.title);
        await createAnnouncement({ ...payload, id });
        addToast('success', 'Announcement created');
      }
      setShowForm(false);
      load(page);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed';
      addToast('error', `Failed to save: ${message}`);
    }
    setSaving(false);
  };

  const handleToggleActive = async (a: Announcement) => {
    try {
      await toggleAnnouncementActive(a.id);
      addToast('success', a.isActive ? 'Deactivated' : 'Activated');
      load(page);
    } catch {
      addToast('error', 'Failed to toggle announcement');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteTarget.id);
      addToast('success', 'Announcement deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete announcement');
    }
    setDeleting(false);
  };

  const handleResetDismissals = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      await resetAnnouncementDismissals(resetTarget.id);
      addToast('success', 'Dismissals reset — all users will see this banner again');
      setResetTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to reset dismissals');
    }
    setResetting(false);
  };

  const previewHtml = useMemo(
    () => DOMPurify.sanitize(md.render(form.bodyMd || '')),
    [form.bodyMd],
  );

  if (loading && items.length === 0) {
    return <p className="admin__loading">Loading announcements...</p>;
  }

  return (
    <>
      <div className="admin__toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <select
          className="admin__search"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AnnouncementStatus | '')}
          style={{ maxWidth: 160 }}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="scheduled">Scheduled</option>
          <option value="ended">Ended</option>
          <option value="inactive">Inactive</option>
        </select>
        <select
          className="admin__search"
          value={audienceFilter}
          onChange={(e) => setAudienceFilter(e.target.value as AnnouncementAudience | '')}
          style={{ maxWidth: 200 }}
        >
          <option value="">All audiences</option>
          <option value="public">Everyone</option>
          <option value="authenticated">Logged-in members</option>
          <option value="admin">Admins only</option>
        </select>
        <select
          className="admin__search"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as AnnouncementSeverity | '')}
          style={{ maxWidth: 160 }}
        >
          <option value="">All severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <button className="admin__create-btn" onClick={openCreate}>+ Create Announcement</button>
      </div>

      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Severity</th>
              <th>Audience</th>
              <th>Status</th>
              <th>Schedule</th>
              <th>Priority</th>
              <th>Dismissals</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => {
              const status = deriveStatus(a);
              const schedule = [
                a.startsAt ? `From ${new Date(a.startsAt).toLocaleString()}` : null,
                a.endsAt ? `Until ${new Date(a.endsAt).toLocaleString()}` : null,
              ].filter(Boolean).join(' ');
              return (
                <tr key={a.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      {a.id}
                    </div>
                  </td>
                  <td>
                    <span className={`admin__badge admin__badge--${a.severity === 'critical' ? 'admin' : a.severity === 'warning' ? 'warning' : 'member'}`}>
                      {SEVERITY_LABELS[a.severity]}
                    </span>
                  </td>
                  <td>{AUDIENCE_LABELS[a.audience]}</td>
                  <td>
                    <span className={STATUS_BADGE[status]}>{status}</span>
                  </td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    {schedule || 'Always'}
                  </td>
                  <td>{a.priority}</td>
                  <td>{a.dismissalCount}</td>
                  <td style={{ verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <button className="admin__action-btn" onClick={() => openEdit(a)}>Edit</button>
                      <button className="admin__action-btn" onClick={() => handleToggleActive(a)}>
                        {a.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="admin__action-btn"
                        onClick={() => setResetTarget(a)}
                        disabled={a.dismissalCount === 0}
                      >
                        Reset
                      </button>
                      <button
                        className="admin__action-btn admin__action-btn--danger"
                        onClick={() => setDeleteTarget(a)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>
                  No announcements yet. Click "Create Announcement" to publish one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {showForm && (
        <AdminFormModal
          title={editingId ? 'Edit Announcement' : 'Create Announcement'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
          wide
          isDirty={isDirty}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Title *</label>
              <input
                className="afm-input"
                value={form.title}
                maxLength={300}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            {!editingId && (
              <div className="afm-field">
                <label className="afm-label">ID (slug)</label>
                <input
                  className="afm-input"
                  value={form.id}
                  placeholder={slugify(form.title) || 'auto-from-title'}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                />
              </div>
            )}
          </div>

          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Severity</label>
              <select
                className="afm-input"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value as AnnouncementSeverity })}
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="afm-field">
              <label className="afm-label">Audience</label>
              <select
                className="afm-input"
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value as AnnouncementAudience })}
              >
                <option value="public">Everyone (public)</option>
                <option value="authenticated">Logged-in members</option>
                <option value="admin">Admins only</option>
              </select>
            </div>
            <div className="afm-field">
              <label className="afm-label">Priority</label>
              <input
                className="afm-input"
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>

          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">CTA label (optional)</label>
              <input
                className="afm-input"
                value={form.ctaLabel}
                maxLength={60}
                placeholder="Vote now"
                onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
              />
            </div>
            <div className="afm-field">
              <label className="afm-label">CTA URL (optional)</label>
              <input
                className="afm-input"
                value={form.ctaUrl}
                maxLength={500}
                placeholder="/contest or https://example.com"
                onChange={(e) => setForm({ ...form, ctaUrl: e.target.value })}
              />
            </div>
          </div>

          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Starts at (optional)</label>
              <input
                className="afm-input"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
            </div>
            <div className="afm-field">
              <label className="afm-label">Ends at (optional)</label>
              <input
                className="afm-input"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            </div>
          </div>

          <div className="afm-checkbox-row">
            <input
              type="checkbox"
              id="ann-active"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            <label htmlFor="ann-active">Active (banner will be displayed when scheduling allows)</label>
          </div>

          <div className="afm-checkbox-row">
            <input
              type="checkbox"
              id="ann-dismissable"
              checked={form.isDismissable}
              onChange={(e) => setForm({ ...form, isDismissable: e.target.checked })}
            />
            <label htmlFor="ann-dismissable">
              Dismissable
              {!form.isDismissable && (
                <span style={{ marginLeft: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                  — users won't be able to close this banner. Use sparingly.
                </span>
              )}
            </label>
          </div>

          <div className="afm-field">
            <label className="afm-label">
              Body (Markdown) * <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                — {form.bodyMd.length}/2000
              </span>
            </label>
            <div className="admin__split-pane">
              <textarea
                className="admin__md-editor"
                value={form.bodyMd}
                maxLength={2000}
                onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
                placeholder="Short message with optional **bold** or [links](/contest)"
              />
              <div
                className="admin__md-preview"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Announcement"
          message={`Delete "${deleteTarget.title}"? Dismissals will also be cleared. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {resetTarget && (
        <ConfirmDialog
          title="Reset dismissals?"
          message={`Reset dismissals for "${resetTarget.title}"? All ${resetTarget.dismissalCount} user${resetTarget.dismissalCount === 1 ? '' : 's'} who closed this banner will see it again.`}
          confirmLabel="Reset"
          loading={resetting}
          onConfirm={handleResetDismissals}
          onCancel={() => setResetTarget(null)}
        />
      )}
    </>
  );
}
