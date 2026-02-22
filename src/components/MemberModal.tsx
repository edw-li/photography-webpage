import { useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Member } from '../types/members';

const SOCIAL_ICONS: Record<string, ReactNode> = {
  instagram: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  twitter: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" />
    </svg>
  ),
  flickr: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="7" cy="12" r="4.5" />
      <circle cx="17" cy="12" r="4.5" opacity="0.6" />
    </svg>
  ),
  facebook: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  ),
  youtube: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  ),
  linkedin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
};

const WEBSITE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const GENERIC_LINK_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

interface MemberModalProps {
  member: Member | null;
  onClose: () => void;
}

export default function MemberModal({ member, onClose }: MemberModalProps) {
  const [photoIndex, setPhotoIndex] = useState(0);

  const photos = member?.samplePhotos ?? [];
  const hasPhotos = photos.length > 0;
  const hasMultiplePhotos = photos.length > 1;

  const goToPrev = useCallback(() => {
    setPhotoIndex((i) => (i === 0 ? photos.length - 1 : i - 1));
  }, [photos.length]);

  const goToNext = useCallback(() => {
    setPhotoIndex((i) => (i === photos.length - 1 ? 0 : i + 1));
  }, [photos.length]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [member]);

  useEffect(() => {
    if (!member) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (hasMultiplePhotos) {
        if (e.key === 'ArrowLeft') goToPrev();
        if (e.key === 'ArrowRight') goToNext();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [member, onClose, hasMultiplePhotos, goToPrev, goToNext]);

  if (!member) return null;

  const socialEntries = member.socialLinks
    ? Object.entries(member.socialLinks).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    : [];
  const hasLinks = socialEntries.length > 0 || member.website;

  return (
    <div className="members__modal-backdrop" onClick={onClose}>
      <div className="members__modal" onClick={(e) => e.stopPropagation()}>
        <button className="members__modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="members__modal-header">
          <div className="members__modal-avatar">
            <img src={member.avatar} alt={member.name} />
          </div>
          <div className="members__modal-info">
            <h3>{member.name}</h3>
            {member.photographyType && (
              <span className="members__modal-type">{member.photographyType}</span>
            )}
            <span className="members__modal-specialty">{member.specialty}</span>
          </div>
        </div>

        {member.bio && (
          <div className="members__modal-bio">
            <p>{member.bio}</p>
          </div>
        )}

        {hasLinks && (
          <div className="members__modal-links">
            {member.website && (
              <a
                href={member.website}
                target="_blank"
                rel="noopener noreferrer"
                className="members__modal-link"
                title="Website"
              >
                {WEBSITE_ICON}
              </a>
            )}
            {socialEntries.map(([platform, url]) => (
              <a
                key={platform}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="members__modal-link"
                title={platform.charAt(0).toUpperCase() + platform.slice(1)}
              >
                {SOCIAL_ICONS[platform] ?? GENERIC_LINK_ICON}
              </a>
            ))}
          </div>
        )}

        {hasPhotos && (
          <div className="members__carousel">
            <div className="members__carousel-viewport">
              <div
                className="members__carousel-track"
                style={{ transform: `translateX(-${photoIndex * 100}%)` }}
              >
                {photos.map((photo, i) => (
                  <div className="members__carousel-slide" key={i}>
                    <img src={photo.src} alt={photo.caption ?? `${member.name} photo ${i + 1}`} />
                    {photo.caption && (
                      <span className="members__carousel-caption">{photo.caption}</span>
                    )}
                  </div>
                ))}
              </div>
              {hasMultiplePhotos && (
                <>
                  <button
                    className="members__carousel-arrow members__carousel-arrow--prev"
                    onClick={goToPrev}
                    aria-label="Previous photo"
                  >
                    &#8249;
                  </button>
                  <button
                    className="members__carousel-arrow members__carousel-arrow--next"
                    onClick={goToNext}
                    aria-label="Next photo"
                  >
                    &#8250;
                  </button>
                </>
              )}
            </div>
            {hasMultiplePhotos && (
              <div className="members__carousel-dots">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    className={`members__carousel-dot${i === photoIndex ? ' members__carousel-dot--active' : ''}`}
                    onClick={() => setPhotoIndex(i)}
                    aria-label={`Go to photo ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
