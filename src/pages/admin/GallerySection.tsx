import { useState, useEffect, useCallback } from 'react';
import {
  getGalleryPhotos,
  createGalleryPhoto,
  updateGalleryPhoto,
  deleteGalleryPhoto,
} from '../../api/gallery';
import { getMembers } from '../../api/members';
import type { GalleryPhoto } from '../../types/gallery';
import type { Member } from '../../types/members';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import ImageUploadField from '../../components/ImageUploadField';
import { getImageUrl } from '../../utils/imageUrl';
import Pagination from './Pagination';

const IMAGE_OFF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="2" y1="2" x2="22" y2="22" />
    <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
    <path d="M21 15V6a2 2 0 0 0-2-2H9" />
    <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
  </svg>
);

function GalleryThumb({ src, alt }: { src: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="img-error-fallback" style={{ width: 48, height: 48, borderRadius: 4 }}>
        {IMAGE_OFF_ICON}
      </div>
    );
  }
  return (
    <img
      src={getImageUrl(src, 'thumb')}
      alt={alt}
      style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}
      onError={() => setErrored(true)}
    />
  );
}

const emptyForm = {
  title: '',
  photographer: '',
  url: '',
  memberId: '' as string,
  camera: '',
  focalLength: '',
  aperture: '',
  shutterSpeed: '',
  iso: '',
};

export default function GallerySection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState<GalleryPhoto | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GalleryPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getGalleryPhotos(p, pageSize);
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load gallery');
    }
    setLoading(false);
  }, [addToast]);

  useEffect(() => { load(page); }, [load, page]);
  useEffect(() => {
    getMembers({ pageSize: 200 }).then((r) => setMembers(r.items)).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditingPhoto(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (photo: GalleryPhoto) => {
    setEditingPhoto(photo);
    setForm({
      title: photo.title,
      photographer: photo.photographer,
      url: photo.url,
      memberId: '',
      camera: photo.exif?.camera || '',
      focalLength: photo.exif?.focalLength || '',
      aperture: photo.exif?.aperture || '',
      shutterSpeed: photo.exif?.shutterSpeed || '',
      iso: photo.exif?.iso ? String(photo.exif.iso) : '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.title || !form.photographer) {
      addToast('error', 'Title and photographer are required');
      return;
    }
    if (!form.url) {
      addToast('error', 'Please upload an image');
      return;
    }
    setSaving(true);
    try {
      const hasExif = form.camera || form.focalLength || form.aperture || form.shutterSpeed || form.iso;
      if (editingPhoto) {
        await updateGalleryPhoto(editingPhoto.id, {
          title: form.title,
          photographer: form.photographer,
          url: form.url,
          memberId: form.memberId ? parseInt(form.memberId) : null,
          exif: hasExif ? {
            camera: form.camera || undefined,
            focalLength: form.focalLength || undefined,
            aperture: form.aperture || undefined,
            shutterSpeed: form.shutterSpeed || undefined,
            iso: form.iso ? parseInt(form.iso) : undefined,
          } : null,
        });
      } else {
        await createGalleryPhoto({
          url: form.url,
          title: form.title,
          photographer: form.photographer,
          memberId: form.memberId ? parseInt(form.memberId) : null,
          exif: hasExif ? {
            camera: form.camera || undefined,
            focalLength: form.focalLength || undefined,
            aperture: form.aperture || undefined,
            shutterSpeed: form.shutterSpeed || undefined,
            iso: form.iso ? parseInt(form.iso) : undefined,
          } : null,
        });
      }
      addToast('success', editingPhoto ? 'Photo updated' : 'Photo added');
      setShowForm(false);
      load(page);
    } catch {
      addToast('error', `Failed to ${editingPhoto ? 'update' : 'add'} photo`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteGalleryPhoto(deleteTarget.id);
      addToast('success', 'Photo deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete photo');
    }
    setDeleting(false);
  };

  const filtered = search
    ? items.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.photographer.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  if (loading) return <p className="admin__loading">Loading gallery...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input className="admin__search" placeholder="Search gallery..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="admin__create-btn" onClick={openCreate}>+ Add Photo</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr><th style={{ width: 60 }}>Thumb</th><th>Title</th><th>Photographer</th><th>EXIF</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td><GalleryThumb src={p.url} alt={p.title} /></td>
                <td>{p.title}</td>
                <td>{p.photographer}</td>
                <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {p.exif?.camera || '—'}
                </td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="admin__action-btn" onClick={() => openEdit(p)}>Edit</button>
                  <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(p)}>Delete</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No photos yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {showForm && (
        <AdminFormModal
          title={editingPhoto ? 'Edit Photo' : 'Add Photo'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
        >
          <ImageUploadField
            value={form.url}
            onChange={(url) => setForm({ ...form, url })}
            category="gallery"
            label="Image"
            required
          />

          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Title *</label>
              <input className="afm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Photographer *</label>
              <input className="afm-input" value={form.photographer} onChange={(e) => setForm({ ...form, photographer: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Member</label>
            <select className="afm-select" value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
              <option value="">None</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>EXIF Data</summary>
            <div style={{ marginTop: '0.75rem' }}>
              <div className="afm-row">
                <div className="afm-field">
                  <label className="afm-label">Camera</label>
                  <input className="afm-input" value={form.camera} onChange={(e) => setForm({ ...form, camera: e.target.value })} />
                </div>
                <div className="afm-field">
                  <label className="afm-label">Focal Length</label>
                  <input className="afm-input" value={form.focalLength} onChange={(e) => setForm({ ...form, focalLength: e.target.value })} />
                </div>
              </div>
              <div className="afm-row">
                <div className="afm-field">
                  <label className="afm-label">Aperture</label>
                  <input className="afm-input" value={form.aperture} onChange={(e) => setForm({ ...form, aperture: e.target.value })} />
                </div>
                <div className="afm-field">
                  <label className="afm-label">Shutter Speed</label>
                  <input className="afm-input" value={form.shutterSpeed} onChange={(e) => setForm({ ...form, shutterSpeed: e.target.value })} />
                </div>
              </div>
              <div className="afm-field">
                <label className="afm-label">ISO</label>
                <input className="afm-input" value={form.iso} onChange={(e) => setForm({ ...form, iso: e.target.value })} />
              </div>
            </div>
          </details>
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Photo"
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
