import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getMyProfile, updateMyProfile } from '../api/auth';
import type { SocialLinks } from '../types/members';
import ImageUploadField from '../components/ImageUploadField';
import MultiImageUploadField, { type ImageWithCaption } from '../components/MultiImageUploadField';
import './ProfilePage.css';

const PLATFORMS = ['Instagram', 'Twitter', 'Flickr', 'Facebook', 'YouTube', 'LinkedIn'] as const;

interface SocialRow {
  platform: string;
  url: string;
}

export default function ProfilePage() {
  const { user, isAuthenticated, loading, refreshUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [specialty, setSpecialty] = useState('General Photography');
  const [avatar, setAvatar] = useState('');
  const [photographyType, setPhotographyType] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [socialRows, setSocialRows] = useState<SocialRow[]>([]);
  const [photoItems, setPhotoItems] = useState<ImageWithCaption[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!loading && isAuthenticated) {
      getMyProfile()
        .then((profile) => {
          setFirstName(profile.firstName || '');
          setLastName(profile.lastName || '');
          if (profile.member) {
            const m = profile.member;
            setSpecialty(m.specialty || 'General Photography');
            setAvatar(m.avatar === 'DEFAULT' ? '' : m.avatar || '');
            setPhotographyType(m.photographyType || '');
            setWebsite(m.website || '');
            setBio(m.bio || '');
            if (m.socialLinks) {
              const rows = Object.entries(m.socialLinks as SocialLinks)
                .filter(([, url]) => url)
                .map(([platform, url]) => ({ platform, url: url! }));
              setSocialRows(rows);
            }
            if (m.samplePhotos) {
              setPhotoItems(m.samplePhotos.map((p) => ({ url: p.src, caption: p.caption || '' })));
            }
          }
        })
        .catch(() => addToast('error', 'Failed to load profile'))
        .finally(() => setLoadingProfile(false));
    }
  }, [loading, isAuthenticated, navigate, addToast]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('First name is required.');
      return;
    }
    if (!lastName.trim()) {
      setError('Last name is required.');
      return;
    }
    if (!specialty.trim()) {
      setError('Specialty is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const socialLinksObj: Record<string, string> = {};
      for (const row of socialRows) {
        if (row.platform && row.url.trim()) {
          socialLinksObj[row.platform] = row.url.trim();
        }
      }
      const payload: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        specialty: specialty.trim(),
        avatar: avatar.trim() || 'DEFAULT',
        photographyType: photographyType.trim() || null,
        website: website.trim() || null,
        bio: bio.trim() || null,
        socialLinks: Object.keys(socialLinksObj).length > 0 ? socialLinksObj : null,
        samplePhotos: photoItems.filter((p) => p.url.trim()).length > 0
          ? photoItems.filter((p) => p.url.trim()).map((p) => ({ src: p.url, caption: p.caption || undefined }))
          : null,
      };
      await updateMyProfile(payload);
      await refreshUser();
      addToast('success', 'Profile updated successfully');
    } catch {
      addToast('error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Social link helpers
  const addSocialRow = () => setSocialRows([...socialRows, { platform: 'Instagram', url: '' }]);
  const removeSocialRow = (i: number) => setSocialRows(socialRows.filter((_, idx) => idx !== i));
  const updateSocialRow = (i: number, field: 'platform' | 'url', value: string) => {
    const updated = [...socialRows];
    updated[i] = { ...updated[i], [field]: value };
    setSocialRows(updated);
  };



  if (loading || loadingProfile) {
    return (
      <div className="profile-page">
        <div className="profile-page__inner">
          <p className="profile-loading">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const avatarValue = avatar.trim() && avatar.trim() !== 'DEFAULT' ? avatar : '';

  return (
    <div className="profile-page">
      <div className="profile-page__hero">
        <div className="profile-page__hero-bg">
          <img src="https://picsum.photos/seed/profile-hero/1600/600" alt="" aria-hidden="true" />
        </div>
        <div className="profile-page__hero-content container">
          <h1>My Profile</h1>
          <p>Manage your photography club profile</p>
        </div>
      </div>
      <div className="profile-page__inner">
        <form onSubmit={handleSubmit}>
          {/* Personal Info */}
          <div className="profile-section">
            <h2>Personal Info</h2>
            <div className="profile-row">
              <div className="profile-field">
                <label>First Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div className="profile-field">
                <label>Last Name <span className="required">*</span></label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div className="profile-field">
              <label>Specialty <span className="required">*</span></label>
              <input
                type="text"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                placeholder="e.g. Street Photography"
              />
            </div>
          </div>

          {/* Profile Details */}
          <div className="profile-section">
            <h2>Profile Details</h2>
            <div className="profile-field">
              <label>Avatar</label>
              <ImageUploadField
                value={avatarValue}
                onChange={setAvatar}
                category="avatars"
                shape="circle"
              />
            </div>
            <div className="profile-field">
              <label>Photography Type</label>
              <input
                type="text"
                value={photographyType}
                onChange={(e) => setPhotographyType(e.target.value)}
                placeholder="e.g. Digital, Film, Both"
              />
            </div>
            <div className="profile-field">
              <label>Website</label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourwebsite.com"
              />
            </div>
            <div className="profile-field">
              <label>Bio</label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us about yourself..."
              />
            </div>
          </div>

          {/* Social Links */}
          <div className="profile-section">
            <h2>Social Media Links</h2>
            {socialRows.map((row, i) => (
              <div key={i} className="profile-list-row">
                <select
                  value={row.platform}
                  onChange={(e) => updateSocialRow(i, 'platform', e.target.value)}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={row.url}
                  onChange={(e) => updateSocialRow(i, 'url', e.target.value)}
                  placeholder="https://..."
                />
                <button
                  type="button"
                  className="profile-list-remove"
                  onClick={() => removeSocialRow(i)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-list-add" onClick={addSocialRow}>
              + Add Social Link
            </button>
          </div>

          {/* Sample Photos */}
          <div className="profile-section">
            <h2>Sample Photos</h2>
            <MultiImageUploadField
              items={photoItems}
              onChange={setPhotoItems}
              category="sample-photos"
              maxItems={10}
            />
          </div>

          {error && <p className="profile-error">{error}</p>}

          <div className="profile-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
