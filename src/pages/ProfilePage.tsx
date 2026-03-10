import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { getMyProfile, updateMyProfile, addSamplePhoto, deleteSamplePhoto, updateSamplePhotoCaptions, getSubscriptionStatus, updateSubscription } from '../api/auth';
import type { SocialLinks } from '../types/members';
import ImageUploadField from '../components/ImageUploadField';
import MultiImageUploadField, { type ImageWithCaption } from '../components/MultiImageUploadField';
import './ProfilePage.css';

const PLATFORMS = ['Instagram', 'Twitter', 'Flickr', 'Facebook', 'YouTube', 'LinkedIn'] as const;

interface SocialRow {
  platform: string;
  url: string;
}

interface OriginalData {
  firstName: string;
  lastName: string;
  specialty: string;
  avatar: string;
  photographyType: string;
  website: string;
  bio: string;
  socialRows: SocialRow[];
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
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Newsletter subscription state
  const [subscribed, setSubscribed] = useState(false);
  const [loadingSubscription, setLoadingSubscription] = useState(true);
  const [togglingSubscription, setTogglingSubscription] = useState(false);

  // Per-section saving state
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingSocial, setSavingSocial] = useState(false);
  const [savingCaptions, setSavingCaptions] = useState(false);

  // Original captions for dirty detection
  const buildCaptionMap = (items: ImageWithCaption[]) =>
    new Map(items.filter((i) => i.id != null).map((i) => [i.id!, i.caption]));
  const [originalCaptions, setOriginalCaptions] = useState<Map<number, string>>(() => new Map());

  // Original data for dirty detection
  const originalRef = useRef<OriginalData>({
    firstName: '',
    lastName: '',
    specialty: 'General Photography',
    avatar: '',
    photographyType: '',
    website: '',
    bio: '',
    socialRows: [],
  });
  const [original, setOriginal] = useState<OriginalData>(originalRef.current);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!loading && isAuthenticated) {
      getMyProfile()
        .then((profile) => {
          const fn = profile.firstName || '';
          const ln = profile.lastName || '';
          setFirstName(fn);
          setLastName(ln);

          let sp = 'General Photography';
          let av = '';
          let pt = '';
          let ws = '';
          let bi = '';
          let sr: SocialRow[] = [];

          if (profile.member) {
            const m = profile.member;
            sp = m.specialty || 'General Photography';
            av = m.avatar === 'DEFAULT' ? '' : m.avatar || '';
            pt = m.photographyType || '';
            ws = m.website || '';
            bi = m.bio || '';
            if (m.socialLinks) {
              sr = Object.entries(m.socialLinks as SocialLinks)
                .filter(([, url]) => url)
                .map(([platform, url]) => ({ platform, url: url! }));
            }
            if (m.samplePhotos) {
              const items = m.samplePhotos.map((p) => ({ id: p.id, url: p.src, caption: p.caption || '' }));
              setPhotoItems(items);
              setOriginalCaptions(buildCaptionMap(items));
            }
          }

          setSpecialty(sp);
          setAvatar(av);
          setPhotographyType(pt);
          setWebsite(ws);
          setBio(bi);
          setSocialRows(sr);

          const orig: OriginalData = {
            firstName: fn,
            lastName: ln,
            specialty: sp,
            avatar: av,
            photographyType: pt,
            website: ws,
            bio: bi,
            socialRows: sr,
          };
          originalRef.current = orig;
          setOriginal(orig);
        })
        .catch(() => addToast('error', 'Failed to load profile'))
        .finally(() => setLoadingProfile(false));

      getSubscriptionStatus()
        .then((data) => setSubscribed(data.subscribed))
        .catch(() => {})
        .finally(() => setLoadingSubscription(false));
    }
  }, [loading, isAuthenticated, navigate, addToast]);

  // --- Dirty detection ---
  const personalInfoDirty =
    firstName !== original.firstName ||
    lastName !== original.lastName ||
    specialty !== original.specialty;

  const profileDetailsDirty =
    avatar !== original.avatar ||
    photographyType !== original.photographyType ||
    website !== original.website ||
    bio !== original.bio;

  const serializeSocial = (rows: SocialRow[]) =>
    JSON.stringify([...rows].filter(r => r.url.trim()).sort((a, b) => a.platform.localeCompare(b.platform)));
  const socialLinksDirty = serializeSocial(socialRows) !== serializeSocial(original.socialRows);

  const captionsDirty = photoItems.some((item) => {
    if (item.id == null) return false;
    const orig = originalCaptions.get(item.id);
    return orig !== undefined && item.caption !== orig;
  });

  // --- Per-section save handlers ---
  const savePersonalInfo = async () => {
    if (!firstName.trim()) { addToast('error', 'First name is required'); return; }
    if (!lastName.trim()) { addToast('error', 'Last name is required'); return; }
    if (!specialty.trim()) { addToast('error', 'Specialty is required'); return; }
    setSavingPersonal(true);
    try {
      await updateMyProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        specialty: specialty.trim(),
      });
      await refreshUser();
      const updated = { ...original, firstName: firstName.trim(), lastName: lastName.trim(), specialty: specialty.trim() };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Personal info saved');
    } catch {
      addToast('error', 'Failed to save personal info');
    } finally {
      setSavingPersonal(false);
    }
  };

  const cancelPersonalInfo = () => {
    setFirstName(original.firstName);
    setLastName(original.lastName);
    setSpecialty(original.specialty);
  };

  const saveProfileDetails = async () => {
    setSavingDetails(true);
    try {
      await updateMyProfile({
        avatar: avatar.trim() || 'DEFAULT',
        photographyType: photographyType.trim() || null,
        website: website.trim() || null,
        bio: bio.trim() || null,
      });
      await refreshUser();
      const updated = { ...original, avatar, photographyType, website, bio };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Profile details saved');
    } catch {
      addToast('error', 'Failed to save profile details');
    } finally {
      setSavingDetails(false);
    }
  };

  const cancelProfileDetails = () => {
    setAvatar(original.avatar);
    setPhotographyType(original.photographyType);
    setWebsite(original.website);
    setBio(original.bio);
  };

  const saveSocialLinks = async () => {
    setSavingSocial(true);
    try {
      const socialLinksObj: Record<string, string> = {};
      for (const row of socialRows) {
        if (row.platform && row.url.trim()) {
          socialLinksObj[row.platform] = row.url.trim();
        }
      }
      await updateMyProfile({
        socialLinks: socialLinksObj,
      });
      await refreshUser();
      const updated = { ...original, socialRows: [...socialRows] };
      originalRef.current = updated;
      setOriginal(updated);
      addToast('success', 'Social links saved');
    } catch {
      addToast('error', 'Failed to save social links');
    } finally {
      setSavingSocial(false);
    }
  };

  const cancelSocialLinks = () => {
    setSocialRows([...original.socialRows]);
  };

  // --- Sample photo auto-save handlers ---
  const handleAddPhoto = async (src: string) => {
    const result = await addSamplePhoto(src);
    setOriginalCaptions((prev) => new Map([...prev, [result.id, '']]));
    return { id: result.id };
  };

  const handleRemovePhoto = async (id: number) => {
    await deleteSamplePhoto(id);
    setOriginalCaptions((prev) => { const m = new Map(prev); m.delete(id); return m; });
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
      await updateSamplePhotoCaptions(updates);
      setOriginalCaptions(buildCaptionMap(photoItems));
      addToast('success', 'Captions saved');
    } catch {
      addToast('error', 'Failed to save captions');
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

  // Newsletter subscription toggle
  const toggleSubscription = async () => {
    setTogglingSubscription(true);
    try {
      const result = await updateSubscription(!subscribed);
      setSubscribed(result.subscribed);
      addToast('success', result.subscribed ? 'Subscribed to newsletter' : 'Unsubscribed from newsletter');
    } catch {
      addToast('error', 'Failed to update subscription');
    } finally {
      setTogglingSubscription(false);
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
          <div className="profile-section__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelPersonalInfo}
              disabled={!personalInfoDirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={savePersonalInfo}
              disabled={!personalInfoDirty || savingPersonal}
            >
              {savingPersonal ? 'Saving...' : 'Save'}
            </button>
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
          <div className="profile-section__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelProfileDetails}
              disabled={!profileDetailsDirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveProfileDetails}
              disabled={!profileDetailsDirty || savingDetails}
            >
              {savingDetails ? 'Saving...' : 'Save'}
            </button>
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
          <div className="profile-section__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelSocialLinks}
              disabled={!socialLinksDirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveSocialLinks}
              disabled={!socialLinksDirty || savingSocial}
            >
              {savingSocial ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Newsletter Subscription */}
        <div className="profile-section">
          <h2>Newsletter Subscription</h2>
          <div className="profile-subscription-row">
            <span>Receive newsletter emails</span>
            <button
              type="button"
              className={`profile-toggle${subscribed ? ' profile-toggle--active' : ''}`}
              onClick={toggleSubscription}
              disabled={loadingSubscription || togglingSubscription}
              aria-label={subscribed ? 'Unsubscribe from newsletter' : 'Subscribe to newsletter'}
            >
              <span className="profile-toggle__thumb" />
            </button>
          </div>
          <p className="profile-section__hint">
            {subscribed ? 'You are subscribed to the newsletter.' : 'You are not subscribed to the newsletter.'}
          </p>
        </div>

        {/* Sample Photos */}
        <div className="profile-section">
          <h2>Sample Photos</h2>
          <p className="profile-section__hint">Photos are saved automatically when uploaded or removed. Save below applies to caption changes.</p>
          <MultiImageUploadField
            items={photoItems}
            onChange={setPhotoItems}
            onAdd={handleAddPhoto}
            onRemove={handleRemovePhoto}
            category="sample-photos"
            maxItems={3}
          />
          <div className="profile-section__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={cancelCaptions}
              disabled={!captionsDirty}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveCaptions}
              disabled={!captionsDirty || savingCaptions}
            >
              {savingCaptions ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
