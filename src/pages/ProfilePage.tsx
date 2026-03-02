import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getMyProfile, updateMyProfile } from '../api/auth';
import type { SocialLinks, SamplePhoto } from '../types/members';
import { User } from 'lucide-react';
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
  const [samplePhotos, setSamplePhotos] = useState<SamplePhoto[]>([]);
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
              setSamplePhotos(m.samplePhotos);
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
        samplePhotos: samplePhotos.filter((sp) => sp.src.trim()).length > 0
          ? samplePhotos.filter((sp) => sp.src.trim())
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

  // Sample photo helpers
  const addSamplePhoto = () => setSamplePhotos([...samplePhotos, { src: '', caption: '' }]);
  const removeSamplePhoto = (i: number) => setSamplePhotos(samplePhotos.filter((_, idx) => idx !== i));
  const updateSamplePhoto = (i: number, field: 'src' | 'caption', value: string) => {
    const updated = [...samplePhotos];
    updated[i] = { ...updated[i], [field]: value };
    setSamplePhotos(updated);
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

  const showAvatarPreview = avatar.trim() && avatar.trim() !== 'DEFAULT';

  return (
    <div className="profile-page">
      <div className="profile-page__inner">
        <h1>My Profile</h1>

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
              <label>Avatar URL</label>
              <input
                type="text"
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
              <div className="profile-avatar-preview">
                {showAvatarPreview ? (
                  <img src={avatar} alt="Avatar preview" />
                ) : (
                  <div className="avatar-placeholder">
                    <User size={28} />
                  </div>
                )}
              </div>
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
            {samplePhotos.map((sp, i) => (
              <div key={i} className="profile-list-row">
                <input
                  type="text"
                  value={sp.src}
                  onChange={(e) => updateSamplePhoto(i, 'src', e.target.value)}
                  placeholder="Image URL"
                />
                <input
                  type="text"
                  value={sp.caption || ''}
                  onChange={(e) => updateSamplePhoto(i, 'caption', e.target.value)}
                  placeholder="Caption (optional)"
                />
                <button
                  type="button"
                  className="profile-list-remove"
                  onClick={() => removeSamplePhoto(i)}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="profile-list-add" onClick={addSamplePhoto}>
              + Add Sample Photo
            </button>
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
