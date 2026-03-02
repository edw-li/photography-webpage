import { useState, useEffect, useCallback } from 'react';
import MarkdownIt from 'markdown-it';
import {
  getNewsletters,
  getNewsletter,
  getNewsletterCategories,
  createNewsletter,
  updateNewsletter,
  deleteNewsletter,
} from '../../api/newsletters';
import type { Newsletter } from '../../types/newsletter';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import { formatDate } from './types';
import Pagination from './Pagination';

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
};

export default function NewslettersSection() {
  const { addToast } = useToast();
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
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Newsletter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 20;

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
    setShowForm(true);
  };

  const openEdit = async (nl: Newsletter) => {
    try {
      const full = await getNewsletter(nl.id);
      setEditingId(nl.id);
      setForm({
        title: full.title,
        category: full.category,
        author: full.author,
        date: full.date,
        preview: full.preview,
        featured: full.featured || false,
        bodyMd: full.bodyMd || '',
      });
      setShowForm(true);
    } catch {
      addToast('error', 'Failed to load newsletter details');
    }
  };

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
        await createNewsletter({ ...form, id });
        addToast('success', 'Newsletter created');
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
            <tr><th>Title</th><th>Category</th><th>Author</th><th>Date</th><th>Featured</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((nl) => (
              <tr key={nl.id}>
                <td>{nl.title}</td>
                <td><span className="admin__badge admin__badge--member">{nl.category}</span></td>
                <td>{nl.author}</td>
                <td>{formatDate(nl.date)}</td>
                <td>{nl.featured ? '\u2605' : '\u2606'}</td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="admin__action-btn" onClick={() => openEdit(nl)}>Edit</button>
                  <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(nl)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center' }}>No newsletters yet</td></tr>
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
          <div className="afm-field">
            <label className="afm-label">Content (Markdown) *</label>
            <div className="admin__split-pane">
              <textarea
                className="admin__md-editor"
                value={form.bodyMd}
                onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
                placeholder="Write markdown here..."
              />
              <div
                className="admin__md-preview"
                dangerouslySetInnerHTML={{ __html: md.render(form.bodyMd || '') }}
              />
            </div>
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
    </>
  );
}
