import { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import {
  getReleaseNotesAdmin,
  createReleaseNote,
  updateReleaseNote,
  deleteReleaseNote,
  toggleReleaseNotePublished,
} from '../../api/releaseNotes';
import type { ReleaseNote } from '../../types/releaseNotes';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import { formatDate } from './types';
import Pagination from './Pagination';

const md = new MarkdownIt();

const emptyForm = {
  version: '',
  date: '',
  bodyMd: '',
  isPublished: true,
};

export default function ReleaseNotesSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReleaseNote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getReleaseNotesAdmin(p, pageSize);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load release notes');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (rn: ReleaseNote) => {
    setEditingId(rn.id);
    const init = {
      version: rn.version,
      date: rn.date,
      bodyMd: rn.bodyMd || '',
      isPublished: rn.isPublished,
    };
    setForm(init);
    setInitialForm(init);
    setShowForm(true);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleSave = async () => {
    if (!form.version.trim() || !form.date || !form.bodyMd.trim()) {
      addToast('error', 'Version, date, and content are required');
      return;
    }
    const payload = { ...form, version: form.version.trim() };
    setSaving(true);
    try {
      if (editingId !== null) {
        await updateReleaseNote(editingId, payload);
        addToast('success', 'Release note updated');
      } else {
        await createReleaseNote(payload);
        addToast('success', 'Release note created');
      }
      setShowForm(false);
      load(page);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        addToast('error', `A release note with version "${payload.version}" already exists`);
      } else {
        addToast('error', `Failed to ${editingId !== null ? 'update' : 'create'} release note`);
      }
    }
    setSaving(false);
  };

  const handleToggle = async (rn: ReleaseNote) => {
    setTogglingId(rn.id);
    try {
      await toggleReleaseNotePublished(rn.id);
      addToast('success', rn.isPublished ? 'Release note unpublished' : 'Release note published');
      load(page);
    } catch {
      addToast('error', 'Failed to update release note');
    }
    setTogglingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteReleaseNote(deleteTarget.id);
      addToast('success', 'Release note deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete release note');
    }
    setDeleting(false);
  };

  const filtered = search
    ? items.filter((rn) => rn.version.toLowerCase().includes(search.toLowerCase()))
    : items;

  if (loading) return <p className="admin__loading">Loading release notes...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search by version..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin__create-btn" onClick={openCreate}>+ Create Release Note</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Version</th><th>Date</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((rn) => (
              <tr key={rn.id}>
                <td>{rn.version}</td>
                <td>{formatDate(rn.date)}</td>
                <td>
                  <span className={`admin__badge admin__badge--${rn.isPublished ? 'active' : 'inactive'}`}>
                    {rn.isPublished ? 'Published' : 'Draft'}
                  </span>
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <button className="admin__action-btn" onClick={() => openEdit(rn)}>Edit</button>
                    <button
                      className="admin__action-btn"
                      onClick={() => handleToggle(rn)}
                      disabled={togglingId === rn.id}
                      style={togglingId === rn.id ? { opacity: 0.6 } : undefined}
                    >
                      {rn.isPublished ? 'Unpublish' : 'Publish'}
                    </button>
                    <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(rn)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center' }}>No release notes yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {showForm && (
        <AdminFormModal
          title={editingId !== null ? 'Edit Release Note' : 'Create Release Note'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
          wide
          isDirty={isDirty}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Version *</label>
              <input
                className="afm-input"
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="v2026.5.1"
              />
            </div>
            <div className="afm-field">
              <label className="afm-label">Date *</label>
              <input
                className="afm-input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <div className="afm-checkbox-row">
            <input
              type="checkbox"
              id="rn-published"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
            />
            <label htmlFor="rn-published">Published (visible on the public page)</label>
          </div>
          <div className="afm-field">
            <label className="afm-label" style={{ marginBottom: '0.4rem' }}>Content (Markdown) *</label>
            <div className="admin__split-pane">
              <textarea
                className="admin__md-editor"
                value={form.bodyMd}
                onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
                placeholder="Write markdown here..."
              />
              <div
                className="admin__md-preview"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(md.render(form.bodyMd || '')) }}
              />
            </div>
          </div>
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Release Note"
          message={`Delete release note "${deleteTarget.version}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
