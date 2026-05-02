import { useState, useEffect, useCallback, useRef } from 'react';
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
import {
  getNewsletters,
  getNewsletter,
  getNewsletterCategories,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
  sendNewsletter,
  sendTestNewsletter,
  uploadNewsletterImage,
} from '../../api/newsletters';
import type { Newsletter } from '../../types/newsletter';
import { ApiError } from '../../api/client';
import { useToast } from '../../contexts/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import NewsletterImageInserter from './NewsletterImageInserter';
import AltTextModal from './AltTextModal';
import { compressImage, isImageFile } from '../../utils/compressImage';
import { formatDate } from './types';
import Pagination from './Pagination';

function altFromFilename(filename: string): string {
  const stem = filename.replace(/\.[^.]+$/, '');
  return stem.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'image';
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const md = new MarkdownIt();

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const emptyForm = {
  title: '',
  category: '',
  author: '',
  date: '',
  preview: '',
  featured: false,
  bodyMd: '',
  sendToSubscribers: false,
};

export default function NewslettersSection() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Newsletter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendTarget, setSendTarget] = useState<Newsletter | null>(null);
  const [sending, setSending] = useState(false);
  const [testTarget, setTestTarget] = useState<Newsletter | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dropUploading, setDropUploading] = useState(false);
  const [pendingAlt, setPendingAlt] = useState<{ url: string; defaultAlt: string; insertPos: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pageSize = 20;

  // Compute the newsletter ID — for new drafts this matches what create_newsletter
  // will use server-side (slugify(title) + '-' + date), so uploads land in the
  // same folder once the newsletter is saved. A title like "!" slugifies to ""
  // and cannot produce a valid ID — the inserter is disabled until both fields
  // produce a non-empty slug.
  const titleSlug = slugify(form.title.trim());
  const draftNewsletterId = editingId ?? (titleSlug && form.date
    ? `${titleSlug}-${form.date}`
    : '');
  const canInsertImages = Boolean(draftNewsletterId);

  const currentInsertPos = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return form.bodyMd.length;
    return el.selectionStart;
  }, [form.bodyMd.length]);

  const queueImageInsert = useCallback((url: string, filename: string) => {
    setPendingAlt({
      url,
      defaultAlt: altFromFilename(filename),
      insertPos: currentInsertPos(),
    });
  }, [currentInsertPos]);

  const finalizeInsert = useCallback((alt: string) => {
    if (!pendingAlt) return;
    const snippet = `\n![${alt}](${pendingAlt.url})\n\n`;
    const insertPos = pendingAlt.insertPos;
    setForm((f) => {
      const safePos = Math.min(Math.max(insertPos, 0), f.bodyMd.length);
      return {
        ...f,
        bodyMd: f.bodyMd.slice(0, safePos) + snippet + f.bodyMd.slice(safePos),
      };
    });
    setPendingAlt(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const pos = Math.min(insertPos + snippet.length, el.value.length);
        el.setSelectionRange(pos, pos);
      }
    });
  }, [pendingAlt]);

  const handleEditorDrop = useCallback(async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    setDragOver(false);
    // Block additional drops while a previous upload is in flight or waiting
    // for alt-text confirmation — otherwise the second upload would overwrite
    // pendingAlt and orphan the first file.
    if (dropUploading || pendingAlt) {
      addToast('info', 'Finish the current image insert first');
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!canInsertImages) {
      addToast('error', 'Set the title and date before adding images');
      return;
    }
    if (!isImageFile(file)) {
      addToast('error', 'Please drop an image file');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      addToast('error', 'Image must be under 10MB');
      return;
    }
    setDropUploading(true);
    try {
      const { file: compressed } = await compressImage(file, { maxSizeMB: 10 });
      const url = await uploadNewsletterImage(compressed, draftNewsletterId);
      queueImageInsert(url, file.name);
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setDropUploading(false);
    }
  }, [addToast, canInsertImages, draftNewsletterId, dropUploading, pendingAlt, queueImageInsert]);

  const handleSendTest = async () => {
    if (!testTarget) return;
    const trimmed = testEmail.trim();
    if (!trimmed) {
      addToast('error', 'Enter an email address');
      return;
    }
    // Fast-path client-side check — backend EmailStr does the real validation,
    // but Pydantic 422s render as raw arrays in toasts, so we pre-empt the
    // common case for a friendlier UX.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      addToast('error', 'Enter a valid email address');
      return;
    }
    setTestSending(true);
    try {
      await sendTestNewsletter(testTarget.id, trimmed);
      addToast('success', `Test email sent to ${trimmed}`);
      setTestTarget(null);
      setTestEmail('');
    } catch (err) {
      let msg = 'Failed to send test email';
      if (err instanceof ApiError) {
        if (err.status === 422) msg = 'Enter a valid email address';
        else if (err.status === 429) msg = 'Too many test sends — please wait a minute';
        else if (typeof err.message === 'string' && err.message.length > 0 && !err.message.startsWith('[object'))
          msg = err.message;
      }
      addToast('error', msg);
    }
    setTestSending(false);
  };

  const openTestDialog = (nl: Newsletter) => {
    setTestTarget(nl);
    setTestEmail(user?.email ?? '');
  };

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getNewsletters(p, pageSize);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load newsletters');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);

  useEffect(() => {
    getNewsletterCategories().then(setCategories).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = async (nl: Newsletter) => {
    try {
      const full = await getNewsletter(nl.id);
      setEditingId(nl.id);
      const init = {
        title: full.title,
        category: full.category,
        author: full.author,
        date: full.date,
        preview: full.preview,
        featured: full.featured || false,
        bodyMd: full.bodyMd || '',
        sendToSubscribers: false,
      };
      setForm(init);
      setInitialForm(init);
      setShowForm(true);
    } catch {
      addToast('error', 'Failed to load newsletter details');
    }
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);

  const handleSave = async () => {
    if (!form.title || !form.date || !form.category || !form.author || !form.bodyMd) {
      addToast('error', 'Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateNewsletter(editingId, form);
        addToast('success', 'Newsletter updated');
      } else {
        const id = slugify(form.title) + '-' + form.date;
        const { sendToSubscribers, ...createData } = form;
        await createNewsletter({ ...createData, id, sendToSubscribers });
        addToast('success', sendToSubscribers ? 'Newsletter created and sent' : 'Newsletter created');
      }
      setShowForm(false);
      load(page);
    } catch {
      addToast('error', `Failed to ${editingId ? 'update' : 'create'} newsletter`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteNewsletter(deleteTarget.id);
      addToast('success', 'Newsletter deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete newsletter');
    }
    setDeleting(false);
  };

  const handleSend = async () => {
    if (!sendTarget) return;
    setSending(true);
    try {
      const result = await sendNewsletter(sendTarget.id);
      addToast(
        'success',
        `Newsletter sent to ${result.sentCount} subscriber${result.sentCount !== 1 ? 's' : ''}${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ''}`,
      );
      setSendTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to send newsletter');
    }
    setSending(false);
  };

  const filtered = search
    ? items.filter((nl) =>
        nl.title.toLowerCase().includes(search.toLowerCase()) ||
        nl.author.toLowerCase().includes(search.toLowerCase()) ||
        nl.category.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  if (loading) return <p className="admin__loading">Loading newsletters...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search newsletters..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="admin__create-btn" onClick={openCreate}>+ Create Newsletter</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th>Title</th><th>Category</th><th>Author</th><th>Date</th><th>Featured</th><th>Emailed</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((nl) => (
              <tr key={nl.id}>
                <td>{nl.title}</td>
                <td><span className="admin__badge admin__badge--member">{nl.category}</span></td>
                <td>{nl.author}</td>
                <td>{formatDate(nl.date)}</td>
                <td>{nl.featured ? '\u2605' : '\u2606'}</td>
                <td>
                  {nl.emailedAt
                    ? <span className="admin__badge admin__badge--success">{formatDate(nl.emailedAt.slice(0, 10))}</span>
                    : <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Not sent</span>}
                </td>
                <td style={{ verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                    <button className="admin__action-btn" onClick={() => openEdit(nl)}>Edit</button>
                    <button className="admin__action-btn" onClick={() => openTestDialog(nl)}>Test</button>
                    <button className="admin__action-btn admin__action-btn--accent" onClick={() => setSendTarget(nl)}>Send</button>
                    <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(nl)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center' }}>No newsletters yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {showForm && (
        <AdminFormModal
          title={editingId ? 'Edit Newsletter' : 'Create Newsletter'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
          wide
          isDirty={isDirty}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Title *</label>
              <input className="afm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Category *</label>
              <input
                className="afm-input"
                list="nl-categories"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="nl-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Author *</label>
              <input className="afm-input" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Date *</label>
              <input className="afm-input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Preview</label>
            <textarea className="afm-textarea" rows={2} value={form.preview} onChange={(e) => setForm({ ...form, preview: e.target.value })} />
          </div>
          <div className="afm-checkbox-row">
            <input type="checkbox" id="nl-featured" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} />
            <label htmlFor="nl-featured">Featured</label>
          </div>
          {!editingId && (
            <div className="afm-checkbox-row">
              <input type="checkbox" id="nl-send" checked={form.sendToSubscribers} onChange={(e) => setForm({ ...form, sendToSubscribers: e.target.checked })} />
              <label htmlFor="nl-send">Email to subscribers on create</label>
            </div>
          )}
          <div className="afm-field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.4rem' }}>
              <label className="afm-label" style={{ marginBottom: 0 }}>Content (Markdown) *</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <NewsletterImageInserter
                  newsletterId={draftNewsletterId}
                  enabled={canInsertImages}
                  onUploaded={queueImageInsert}
                />
                {editingId && (
                  <button
                    type="button"
                    className="admin__action-btn"
                    onClick={() => {
                      const current = items.find((n) => n.id === editingId);
                      if (current) openTestDialog(current);
                    }}
                    disabled={isDirty}
                    title={isDirty
                      ? 'Save your changes first — the test would otherwise send the previously saved version'
                      : 'Send a single-recipient preview email'}
                  >
                    Send test email
                  </button>
                )}
              </div>
            </div>
            <div className="admin__split-pane">
              <textarea
                ref={textareaRef}
                className={`admin__md-editor${dragOver ? ' admin__md-editor--drag' : ''}`}
                value={form.bodyMd}
                onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
                onDragOver={(e) => { e.preventDefault(); if (canInsertImages) setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleEditorDrop}
                placeholder={canInsertImages
                  ? 'Write markdown here. Drop an image anywhere to upload and insert it.'
                  : 'Write markdown here...'}
                disabled={dropUploading}
              />
              <div
                className="admin__md-preview"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(md.render(form.bodyMd || '')) }}
              />
            </div>
            {dropUploading && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Uploading dropped image…
              </p>
            )}
          </div>
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Newsletter"
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {sendTarget && (
        <ConfirmDialog
          title="Send Newsletter"
          message={
            sendTarget.emailedAt
              ? `This newsletter was already emailed on ${formatDate(sendTarget.emailedAt.slice(0, 10))}. Send again to all active subscribers?`
              : `Email "${sendTarget.title}" to all active subscribers?`
          }
          confirmLabel="Send"
          loading={sending}
          onConfirm={handleSend}
          onCancel={() => setSendTarget(null)}
        />
      )}

      {pendingAlt && (
        <AltTextModal
          url={pendingAlt.url}
          defaultAlt={pendingAlt.defaultAlt}
          onConfirm={finalizeInsert}
          onCancel={() => setPendingAlt(null)}
        />
      )}

      {testTarget && (
        <div
          className="confirm-overlay"
          onClick={testSending ? undefined : () => setTestTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Send test email"
        >
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3 className="confirm-dialog__title">Send test email</h3>
            <p className="confirm-dialog__message">
              Send a preview of <strong>{testTarget.title}</strong> to a single address. Subscribers will not be emailed.
            </p>
            <input
              autoFocus
              type="email"
              className="afm-input"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={testSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !testSending) { e.preventDefault(); handleSendTest(); }
                if (e.key === 'Escape' && !testSending) { e.preventDefault(); setTestTarget(null); }
              }}
              style={{ marginBottom: '1rem' }}
            />
            <div className="confirm-dialog__actions">
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--cancel"
                onClick={() => setTestTarget(null)}
                disabled={testSending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="confirm-dialog__btn confirm-dialog__btn--confirm"
                onClick={handleSendTest}
                disabled={testSending}
              >
                {testSending ? 'Sending…' : 'Send test'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
