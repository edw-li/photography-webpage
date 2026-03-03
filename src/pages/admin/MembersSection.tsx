import { useState, useEffect, useCallback } from 'react';
import { getMembersAdmin, createMember, updateMember, deleteMember } from '../../api/members';
import { apiFetch } from '../../api/client';
import type { MemberAdmin, SocialLinks, SamplePhoto } from '../../types/members';
import { useToast } from '../../contexts/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import AdminFormModal from '../../components/AdminFormModal';
import Pagination from './Pagination';

const PLATFORMS = ['instagram', 'twitter', 'flickr', 'facebook', 'youtube', 'linkedin'] as const;
const ROLES = ['', 'President', 'Vice President', 'Treasurer', 'Events Coordinator'] as const;

interface SocialRow { platform: string; url: string }
interface PhotoRow { src: string; caption: string }

const emptyForm = {
  name: '',
  specialty: '',
  avatar: '',
  photographyType: '',
  leadershipRole: '',
  website: '',
  bio: '',
};

export default function MembersSection() {
  const { addToast } = useToast();
  const [items, setItems] = useState<MemberAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberAdmin | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [socialRows, setSocialRows] = useState<SocialRow[]>([]);
  const [photoRows, setPhotoRows] = useState<PhotoRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<MemberAdmin | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const data = await getMembersAdmin({ page: p, pageSize, search: search || undefined });
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } catch {
      addToast('error', 'Failed to load members');
    }
    setLoading(false);
  }, [addToast, search]);

  useEffect(() => { load(page); }, [load, page]);

  const openCreate = () => {
    setEditingMember(null);
    setForm(emptyForm);
    setSocialRows([]);
    setPhotoRows([]);
    setShowForm(true);
  };

  const openEdit = (m: MemberAdmin) => {
    setEditingMember(m);
    setForm({
      name: m.name,
      specialty: m.specialty,
      avatar: m.avatar,
      photographyType: m.photographyType || '',
      leadershipRole: m.leadershipRole || '',
      website: m.website || '',
      bio: m.bio || '',
    });
    const sl: SocialRow[] = m.socialLinks
      ? Object.entries(m.socialLinks).map(([platform, url]) => ({ platform, url: url || '' }))
      : [];
    setSocialRows(sl);
    const sp: PhotoRow[] = m.samplePhotos
      ? m.samplePhotos.map((p) => ({ src: p.src, caption: p.caption || '' }))
      : [];
    setPhotoRows(sp);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.specialty || !form.avatar) {
      addToast('error', 'Name, specialty, and avatar are required');
      return;
    }
    setSaving(true);
    try {
      const socialLinks: SocialLinks = {};
      socialRows.forEach((r) => {
        if (r.platform && r.url) {
          (socialLinks as Record<string, string>)[r.platform] = r.url;
        }
      });
      const samplePhotos: SamplePhoto[] = photoRows
        .filter((r) => r.src)
        .map((r) => ({ src: r.src, caption: r.caption || undefined }));

      const payload = {
        name: form.name,
        specialty: form.specialty,
        avatar: form.avatar,
        photographyType: form.photographyType || undefined,
        leadershipRole: form.leadershipRole || undefined,
        website: form.website || undefined,
        bio: form.bio || undefined,
        socialLinks: Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
        samplePhotos: samplePhotos.length > 0 ? samplePhotos : undefined,
      };

      if (editingMember?.id) {
        await updateMember(editingMember.id, payload);
        addToast('success', 'Member updated');
      } else {
        await createMember(payload);
        addToast('success', 'Member created');
      }
      setShowForm(false);
      load(page);
    } catch {
      addToast('error', `Failed to ${editingMember ? 'update' : 'create'} member`);
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleting(true);
    try {
      await deleteMember(deleteTarget.id);
      addToast('success', 'Member deleted');
      setDeleteTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to delete member');
    }
    setDeleting(false);
  };

  const handleRoleChange = async (m: MemberAdmin) => {
    if (!m.userId) return;
    setLoadingId(m.userId);
    try {
      const newRole = m.userRole === 'admin' ? 'member' : 'admin';
      await apiFetch(`/auth/users/${m.userId}`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole }),
      });
      addToast('success', `User ${newRole === 'admin' ? 'promoted' : 'demoted'}`);
      load(page);
    } catch {
      addToast('error', 'Failed to change user role');
    }
    setLoadingId(null);
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget?.userId) return;
    setConfirming(true);
    try {
      await apiFetch(`/auth/users/${deactivateTarget.userId}`, {
        method: 'PUT',
        body: JSON.stringify({ isActive: !deactivateTarget.isActive }),
      });
      addToast('success', `User ${deactivateTarget.isActive ? 'deactivated' : 'activated'}`);
      setDeactivateTarget(null);
      load(page);
    } catch {
      addToast('error', 'Failed to update user status');
    }
    setConfirming(false);
  };

  if (loading) return <p className="admin__loading">Loading members...</p>;

  return (
    <>
      <div className="admin__toolbar">
        <input
          className="admin__search"
          placeholder="Search members..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <button className="admin__create-btn" onClick={openCreate}>+ Add Member</button>
      </div>
      <div className="admin__table-wrap">
        <table className="admin__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>
                  {m.email
                    ? m.email
                    : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No account</span>}
                </td>
                <td>
                  {m.userId && (
                    <span className={`admin__badge admin__badge--${m.userRole}`} style={{ marginRight: '0.25rem' }}>
                      {m.userRole}
                    </span>
                  )}
                  {m.leadershipRole && (
                    <span className="admin__badge admin__badge--admin">{m.leadershipRole}</span>
                  )}
                  {!m.userId && !m.leadershipRole && '—'}
                </td>
                <td>
                  {m.userId
                    ? <span className={`admin__badge admin__badge--${m.isActive ? 'active' : 'inactive'}`}>
                        {m.isActive ? 'Active' : 'Inactive'}
                      </span>
                    : <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No account</span>}
                </td>
                <td style={{ display: 'flex', gap: '0.5rem', whiteSpace: 'nowrap' }}>
                  <button className="admin__action-btn" onClick={() => openEdit(m)}>Edit</button>
                  {m.userId && (
                    <>
                      <button
                        className="admin__action-btn"
                        onClick={() => handleRoleChange(m)}
                        disabled={loadingId === m.userId}
                        style={loadingId === m.userId ? { opacity: 0.6 } : undefined}
                      >
                        {m.userRole === 'admin' ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        className="admin__action-btn"
                        onClick={() => setDeactivateTarget(m)}
                        disabled={loadingId === m.userId}
                        style={loadingId === m.userId ? { opacity: 0.6 } : undefined}
                      >
                        {m.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </>
                  )}
                  <button className="admin__action-btn admin__action-btn--danger" onClick={() => setDeleteTarget(m)}>Delete</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center' }}>No members yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={pages} total={total} pageSize={pageSize} onPageChange={setPage} />

      {showForm && (
        <AdminFormModal
          title={editingMember ? 'Edit Member' : 'Add Member'}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={saving}
        >
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Name *</label>
              <input className="afm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Specialty *</label>
              <input className="afm-input" value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} />
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Avatar URL *</label>
            <input className="afm-input" value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} />
            {form.avatar && (
              <img src={form.avatar} alt="Avatar preview" style={{ marginTop: 8, width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
            )}
          </div>
          <div className="afm-row">
            <div className="afm-field">
              <label className="afm-label">Photography Type</label>
              <input className="afm-input" value={form.photographyType} onChange={(e) => setForm({ ...form, photographyType: e.target.value })} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Leadership Role</label>
              <select className="afm-select" value={form.leadershipRole} onChange={(e) => setForm({ ...form, leadershipRole: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r || '(None)'}</option>)}
              </select>
            </div>
          </div>
          <div className="afm-field">
            <label className="afm-label">Website</label>
            <input className="afm-input" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          </div>
          <div className="afm-field">
            <label className="afm-label">Bio</label>
            <textarea className="afm-textarea" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </div>

          <div className="afm-field">
            <label className="afm-label">Social Links</label>
            <div className="afm-dynamic-list">
              {socialRows.map((row, i) => (
                <div key={i} className="afm-dynamic-row">
                  <select
                    className="afm-select"
                    style={{ maxWidth: 140 }}
                    value={row.platform}
                    onChange={(e) => {
                      const updated = [...socialRows];
                      updated[i] = { ...row, platform: e.target.value };
                      setSocialRows(updated);
                    }}
                  >
                    <option value="">Platform</option>
                    {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    className="afm-input"
                    placeholder="URL"
                    value={row.url}
                    onChange={(e) => {
                      const updated = [...socialRows];
                      updated[i] = { ...row, url: e.target.value };
                      setSocialRows(updated);
                    }}
                  />
                  <button className="afm-remove-btn" onClick={() => setSocialRows(socialRows.filter((_, j) => j !== i))}>
                    &times;
                  </button>
                </div>
              ))}
              <button className="afm-add-btn" onClick={() => setSocialRows([...socialRows, { platform: '', url: '' }])}>
                + Add Social Link
              </button>
            </div>
          </div>

          <div className="afm-field">
            <label className="afm-label">Sample Photos</label>
            <div className="afm-dynamic-list">
              {photoRows.map((row, i) => (
                <div key={i} className="afm-dynamic-row">
                  <input
                    className="afm-input"
                    placeholder="Image URL"
                    value={row.src}
                    onChange={(e) => {
                      const updated = [...photoRows];
                      updated[i] = { ...row, src: e.target.value };
                      setPhotoRows(updated);
                    }}
                  />
                  <input
                    className="afm-input"
                    placeholder="Caption"
                    value={row.caption}
                    onChange={(e) => {
                      const updated = [...photoRows];
                      updated[i] = { ...row, caption: e.target.value };
                      setPhotoRows(updated);
                    }}
                  />
                  <button className="afm-remove-btn" onClick={() => setPhotoRows(photoRows.filter((_, j) => j !== i))}>
                    &times;
                  </button>
                </div>
              ))}
              <button className="afm-add-btn" onClick={() => setPhotoRows([...photoRows, { src: '', caption: '' }])}>
                + Add Photo
              </button>
            </div>
          </div>
        </AdminFormModal>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Member"
          message={
            deleteTarget.userId
              ? `Delete "${deleteTarget.name}"? Their user account will also be deleted and they will no longer be able to log in. This cannot be undone.`
              : `Delete "${deleteTarget.name}"? This cannot be undone.`
          }
          confirmLabel="Delete"
          danger
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {deactivateTarget && (
        <ConfirmDialog
          title={deactivateTarget.isActive ? 'Deactivate User' : 'Activate User'}
          message={`${deactivateTarget.isActive ? 'Deactivate' : 'Activate'} ${deactivateTarget.email}?`}
          confirmLabel={deactivateTarget.isActive ? 'Deactivate' : 'Activate'}
          danger={deactivateTarget.isActive}
          loading={confirming}
          onConfirm={handleDeactivate}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}
    </>
  );
}
