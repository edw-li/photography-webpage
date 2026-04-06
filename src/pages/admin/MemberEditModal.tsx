import { useState, useRef, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { updateMember, addMemberSamplePhoto, deleteMemberSamplePhoto, updateMemberSamplePhotoCaptions } from '../../api/members';
import { ApiError } from '../../api/client';
import type { MemberAdmin } from '../../types/members';
import { useToast } from '../../contexts/ToastContext';
import ImageUploadField from '../../components/ImageUploadField';
import MultiImageUploadField, { type ImageWithCaption } from '../../components/MultiImageUploadField';
import '../../components/AdminFormModal.css';

const PLATFORMS = ['instagram', 'twitter', 'flickr', 'facebook', 'youtube', 'linkedin'] as const;
const ROLES = ['', 'Founding Member'] as const;

interface SocialRow { platform: string; url: string }

interface OriginalData {
  name: string;
  specialty: string;
  leadershipRole: string;
  avatar: string;
  photographyType: string;
  website: string;
  bio: string;
  socialRows: SocialRow[];
}

interface Props {
  member: MemberAdmin;
  onClose: () => void;
  onSaved: () => void;
}

export default function MemberEditModal({ member, onClose, onSaved }: Props) {
  const { addToast } = useToast();

  // --- Basic Info ---
  const [name, setName] = useState(member.name);
  const [specialty, setSpecialty] = useState(member.specialty);
  const [leadershipRole, setLeadershipRole] = useState(member.leadershipRole || '');

  // --- Profile Details ---
  const [avatar, setAvatar] = useState(member.avatar);
  const [photographyType, setPhotographyType] = useState(member.photographyType || '');
  const [website, setWebsite] = useState(member.website || '');
  const [bio, setBio] = useState(member.bio || '');

  // --- Social Links ---
  const [socialRows, setSocialRows] = useState<SocialRow[]>(
    member.socialLinks
      ? Object.entries(member.socialLinks).map(([platform, url]) => ({ platform, url: url || '' }))
      : [],
  );

  // --- Sample Photos ---
  const [photoItems, setPhotoItems] = useState<ImageWithCaption[]>(
    member.samplePhotos
      ? member.samplePhotos.map((p) => ({ id: p.id, url: p.src, caption: p.caption || '' }))
      : [],
  );

  // --- Saving flags ---
  const [savingBasic, setSavingBasic] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const [savingCaptions, setSavingCaptions] = useState(false);

  // --- Original snapshot ---
  const originalRef = useRef<OriginalData>({
    name: member.name,
    specialty: member.specialty,
    leadershipRole: member.leadershipRole || '',
    avatar: member.avatar,
    photographyType: member.photographyType || '',
    website: member.website || '',
    bio: member.bio || '',
    socialRows: member.socialLinks
      ? Object.entries(member.socialLinks).map(([platform, url]) => ({ platform, url: url || '' }))
      : [],
  });
  const [original, setOriginal] = useState<OriginalData>(originalRef.current);

  // Original captions for dirty detection
  const buildCaptionMap = (items: ImageWithCaption[]) =>
    new Map(items.filter((i) => i.id != null).map((i) => [i.id!, i.caption]));
  const [originalCaptions, setOriginalCaptions] = useState(() => buildCaptionMap(photoItems));

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  // --- Dirty detection ---
  const basicDirty =
    name !== original.name ||
    specialty !== original.specialty ||
    leadershipRole !== original.leadershipRole;

  const detailsDirty =
    avatar !== original.avatar ||
    photographyType !== original.photographyType ||
    website !== original.website ||
    bio !== original.bio;

  const serializeSocial = (rows: SocialRow[]) =>
    JSON.stringify([...rows].filter((r) => r.url.trim()).sort((a, b) => a.platform.localeCompare(b.platform)));
  const socialDirty = serializeSocial(socialRows) !== serializeSocial(original.socialRows);

  const captionsDirty = photoItems.some((item) => {
    if (item.id == null) return false;
    const orig = originalCaptions.get(item.id);
    return orig !== undefined && item.caption !== orig;
  });

  const memberId = member.id!;

  // --- Error helper ---
  const errMsg = (err: unknown) =>
    err instanceof ApiError ? err.message : 'An unexpected error occurred';

  // --- Section save handlers ---
  const saveBasic = async () => {
    if (!name.trim()) { addToast('error', 'Name is required'); return; }
    if (!specialty.trim()) { addToast('error', 'Specialty is required'); return; }
    setSavingBasic(true);
    try {
      await updateMember(memberId, {
        name: name.trim(),
        specialty: specialty.trim(),
        leadershipRole,
      });
      const updated = { ...original, name: name.trim(), specialty: specialty.trim(), leadershipRole };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Basic info saved');
      onSaved();
    } catch (err) {
      addToast('error', errMsg(err));
    } finally {
      setSavingBasic(false);
    }
  };

  const cancelBasic = () => {
    setName(original.name);
    setSpecialty(original.specialty);
    setLeadershipRole(original.leadershipRole);
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      await updateMember(memberId, {
        avatar: avatar.trim() || 'DEFAULT',
        photographyType: photographyType.trim() || undefined,
        website: website.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      const updated = { ...original, avatar, photographyType, website, bio };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Profile details saved');
      onSaved();
    } catch (err) {
      addToast('error', errMsg(err));
    } finally {
      setSavingDetails(false);
    }
  };

  const cancelDetails = () => {
    setAvatar(original.avatar);
    setPhotographyType(original.photographyType);
    setWebsite(original.website);
    setBio(original.bio);
  };

  const saveSocial = async () => {
    setSavingSocial(true);
    try {
      const socialLinksObj: Record<string, string> = {};
      for (const row of socialRows) {
        if (row.platform && row.url.trim()) {
          socialLinksObj[row.platform] = row.url.trim();
        }
      }
      await updateMember(memberId, {
        socialLinks: socialLinksObj,
      });
      const updated = { ...original, socialRows: [...socialRows] };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Social links saved');
      onSaved();
    } catch (err) {
      addToast('error', errMsg(err));
    } finally {
      setSavingSocial(false);
    }
  };

  const cancelSocial = () => {
    setSocialRows([...original.socialRows]);
  };

  // --- Sample photo auto-save handlers ---
  const handleAddPhoto = async (src: string) => {
    const result = await addMemberSamplePhoto(memberId, src);
    // Update original captions map with new photo
    setOriginalCaptions((prev) => new Map([...prev, [result.id, '']]));
    onSaved();
    return { id: result.id };
  };

  const handleRemovePhoto = async (id: number) => {
    await deleteMemberSamplePhoto(memberId, id);
    setOriginalCaptions((prev) => { const m = new Map(prev); m.delete(id); return m; });
    onSaved();
  };

  const saveCaptions = async () => {
    const updates = photoItems
      .filter((item) => {
        if (item.id == null) return false;
        const orig = originalCaptions.get(item.id);
        return orig !== undefined && item.caption !== orig;
      })
      .map((item) => ({ id: item.id!, caption: item.caption || null }));
    if (updates.length === 0) return;
    setSavingCaptions(true);
    try {
      await updateMemberSamplePhotoCaptions(memberId, updates);
      setOriginalCaptions(buildCaptionMap(photoItems));
      addToast('success', 'Captions saved');
      onSaved();
    } catch (err) {
      addToast('error', errMsg(err));
    } finally {
      setSavingCaptions(false);
    }
  };

  const cancelCaptions = () => {
    setPhotoItems((prev) =>
      prev.map((item) => {
        if (item.id == null) return item;
        const orig = originalCaptions.get(item.id);
        return orig !== undefined ? { ...item, caption: orig } : item;
      }),
    );
  };

  return (
    <div className="afm-overlay" onClick={onClose}>
      <div
        className="afm-modal afm-modal--wide"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="afm-header">
          <h3 className="afm-title">Edit Member</h3>
          <button className="afm-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="afm-body">
          {/* Section 1 — Basic Info */}
          <div className="afm-section">
            <h3>Basic Info</h3>
            <div className="afm-row">
              <div className="afm-field">
                <label className="afm-label">Name *</label>
                <input className="afm-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="afm-field">
                <label className="afm-label">Specialty *</label>
                <input className="afm-input" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
              </div>
            </div>
            <div className="afm-field">
              <label className="afm-label">Leadership Role</label>
              <select className="afm-select" value={leadershipRole} onChange={(e) => setLeadershipRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r || '(None)'}</option>)}
              </select>
            </div>
            <div className="afm-section__actions">
              <button className="afm-btn afm-btn--cancel" onClick={cancelBasic} disabled={!basicDirty}>Cancel</button>
              <button className="afm-btn afm-btn--save" onClick={saveBasic} disabled={!basicDirty || savingBasic}>
                {savingBasic && <Loader2 size={14} className="afm-spinner" />}
                {savingBasic ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Section 2 — Profile Details */}
          <div className="afm-section">
            <h3>Profile Details</h3>
            <ImageUploadField
              value={avatar}
              onChange={setAvatar}
              category="avatars"
              label="Avatar"
              shape="circle"
            />
            <div className="afm-field">
              <label className="afm-label">Photography Type</label>
              <input className="afm-input" value={photographyType} onChange={(e) => setPhotographyType(e.target.value)} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Website</label>
              <input className="afm-input" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="afm-field">
              <label className="afm-label">Bio</label>
              <textarea className="afm-textarea" value={bio} onChange={(e) => setBio(e.target.value)} />
            </div>
            <div className="afm-section__actions">
              <button className="afm-btn afm-btn--cancel" onClick={cancelDetails} disabled={!detailsDirty}>Cancel</button>
              <button className="afm-btn afm-btn--save" onClick={saveDetails} disabled={!detailsDirty || savingDetails}>
                {savingDetails && <Loader2 size={14} className="afm-spinner" />}
                {savingDetails ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Section 3 — Social Links */}
          <div className="afm-section">
            <h3>Social Links</h3>
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
                    <X size={16} />
                  </button>
                </div>
              ))}
              <button className="afm-add-btn" onClick={() => setSocialRows([...socialRows, { platform: '', url: '' }])}>
                + Add Social Link
              </button>
            </div>
            <div className="afm-section__actions">
              <button className="afm-btn afm-btn--cancel" onClick={cancelSocial} disabled={!socialDirty}>Cancel</button>
              <button className="afm-btn afm-btn--save" onClick={saveSocial} disabled={!socialDirty || savingSocial}>
                {savingSocial && <Loader2 size={14} className="afm-spinner" />}
                {savingSocial ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {/* Section 4 — Sample Photos */}
          <div className="afm-section">
            <h3>Sample Photos</h3>
            <p className="afm-section__hint">
              Photos save automatically on upload/remove. Save below applies to caption changes.
            </p>
            <MultiImageUploadField
              items={photoItems}
              onChange={setPhotoItems}
              onAdd={handleAddPhoto}
              onRemove={handleRemovePhoto}
              category="sample-photos"
              maxItems={3}
            />
            <div className="afm-section__actions">
              <button className="afm-btn afm-btn--cancel" onClick={cancelCaptions} disabled={!captionsDirty}>Cancel</button>
              <button className="afm-btn afm-btn--save" onClick={saveCaptions} disabled={!captionsDirty || savingCaptions}>
                {savingCaptions && <Loader2 size={14} className="afm-spinner" />}
                {savingCaptions ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
