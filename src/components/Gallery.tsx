import { useState, useEffect, useCallback, useRef } from 'react';
import type { GalleryPhoto } from '../types/gallery';
import { getGalleryPhotos } from '../api/gallery';
import { useImageLoaded } from '../hooks/useImageLoaded';
import { getImageUrl } from '../utils/imageUrl';
import './Gallery.css';

const PAGE_SIZE = 12;

function formatExif(photo: GalleryPhoto): string | null {
  if (!photo.exif) return null;
  const parts: string[] = [];
  if (photo.exif.camera) parts.push(photo.exif.camera);
  if (photo.exif.focalLength) parts.push(photo.exif.focalLength);
  if (photo.exif.aperture) parts.push(photo.exif.aperture);
  if (photo.exif.shutterSpeed) parts.push(photo.exif.shutterSpeed);
  if (photo.exif.iso != null) parts.push(`ISO ${photo.exif.iso}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function winnerLabel(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

function GalleryItem({
  photo,
  onClick,
  onKeyDown,
  ariaLabel,
}: {
  photo: GalleryPhoto;
  onClick: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  ariaLabel: string;
}) {
  const { loaded, errored, handleLoad, handleError, imgRef } = useImageLoaded(getImageUrl(photo.url, 'medium'));
  return (
    <div
      className={`gallery__item${!loaded ? ' shimmer-bg' : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      {errored ? (
        <div className="img-error-fallback">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="2" y1="2" x2="22" y2="22" />
            <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
            <path d="M21 15V6a2 2 0 0 0-2-2H9" />
            <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
          </svg>
        </div>
      ) : (
        <img
          ref={imgRef}
          src={getImageUrl(photo.url, 'medium')}
          alt={photo.title}
          loading="lazy"
          className={`img-fade${loaded ? ' img-fade--loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {photo.isWinner && photo.winnerPlace != null && (
        <span className="gallery__winner-badge">{winnerLabel(photo.winnerPlace)}</span>
      )}
      <div className="gallery__overlay">
        <h3>{photo.title}</h3>
        <p>{photo.photographer}</p>
      </div>
    </div>
  );
}

const CROSSFADE_MS = 300;

function GalleryLightbox({
  photos,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  photos: GalleryPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const photo = photos[index];
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [isClosing, setIsClosing] = useState(false);

  const startClose = () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onClose();
    } else {
      setIsClosing(true);
    }
  };
  const { loaded, errored, handleLoad, handleError, imgRef } = useImageLoaded(getImageUrl(photo.url, 'full'));

  const [prevPhoto, setPrevPhoto] = useState<GalleryPhoto | null>(null);
  const prevIndexRef = useRef(index);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [fadeIn, setFadeIn] = useState(false);
  const fadeUrlRef = useRef('');

  // Synchronous reset — ensures opacity: 0 start state before paint
  const currentUrl = getImageUrl(photo.url, 'full');
  if (fadeUrlRef.current !== currentUrl) {
    fadeUrlRef.current = currentUrl;
    if (fadeIn) setFadeIn(false);
  }

  // Detect navigation — capture outgoing photo
  useEffect(() => {
    if (prevIndexRef.current !== index) {
      if (!prevPhoto) {
        setPrevPhoto(photos[prevIndexRef.current]);
      }
      prevIndexRef.current = index;
    }
  }, [index, photos, prevPhoto]);

  // Cleanup after cross-fade completes
  useEffect(() => {
    if (fadeIn && prevPhoto) {
      fadeTimerRef.current = setTimeout(() => setPrevPhoto(null), CROSSFADE_MS);
    }
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [fadeIn, prevPhoto]);

  const handleLightboxLoad = useCallback(() => {
    handleLoad();
    requestAnimationFrame(() => setFadeIn(true));
  }, [handleLoad]);

  const handleLightboxError = useCallback(() => {
    handleError();
    requestAnimationFrame(() => setFadeIn(true));
  }, [handleError]);

  const displayPhoto = (prevPhoto && !loaded) ? prevPhoto : photo;
  const exifText = formatExif(displayPhoto);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') startClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, onPrev, onNext]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"]), a[href]'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div
      className={`gallery__lightbox-backdrop${isClosing ? ' gallery__lightbox-backdrop--closing' : ''}`}
      onClick={startClose}
      onAnimationEnd={() => { if (isClosing) { setIsClosing(false); onClose(); } }}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.title} by ${photo.photographer}`}
    >
      <div className="gallery__lightbox" onClick={(e) => e.stopPropagation()}>
        <button
          className="gallery__lightbox-close"
          onClick={startClose}
          aria-label="Close lightbox"
          ref={closeRef}
        >
          &times;
        </button>
        <span className="gallery__lightbox-counter">
          {index + 1} / {photos.length}
        </span>
        <div className={`gallery__lightbox-header${fadeIn ? ' gallery__lightbox-header--loaded' : ''}`}>
          <strong>{displayPhoto.title}</strong>
          <span>{displayPhoto.photographer}</span>
        </div>

        <div className="gallery__lightbox-body">
          {!loaded && !prevPhoto && (
            <div className="gallery__lightbox-loading">
              <div className="section-spinner__ring" />
            </div>
          )}

          {prevPhoto && (
            <img
              className={`gallery__lightbox-img gallery__lightbox-img--prev${
                fadeIn ? ' gallery__lightbox-img--fade-out' : ''
              }`}
              src={getImageUrl(prevPhoto.url, 'full')}
              alt=""
            />
          )}

          {errored && !prevPhoto ? (
            <div className="img-error-fallback gallery__lightbox-img gallery__lightbox-img--loaded" style={{ minHeight: 200, minWidth: 300 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48 }}>
                <line x1="2" y1="2" x2="22" y2="22" />
                <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
                <path d="M21 15V6a2 2 0 0 0-2-2H9" />
                <path d="M3 8.7V19a2 2 0 0 0 2 2h12.3" />
              </svg>
            </div>
          ) : (
            <img
              ref={imgRef}
              key={photo.url}
              className={`gallery__lightbox-img${fadeIn ? ' gallery__lightbox-img--loaded' : ''}`}
              src={getImageUrl(photo.url, 'full')}
              alt={photo.title}
              onLoad={handleLightboxLoad}
              onError={handleLightboxError}
            />
          )}
        </div>

        <span className={`gallery__lightbox-exif${fadeIn ? ' gallery__lightbox-exif--loaded' : ''}${exifText ? '' : ' gallery__lightbox-exif--empty'}`}>
          {exifText || '\u00a0'}
        </span>

        <button
          className="gallery__lightbox-arrow gallery__lightbox-arrow--prev"
          onClick={onPrev}
          aria-label="Previous image"
        >
          &#8249;
        </button>
        <button
          className="gallery__lightbox-arrow gallery__lightbox-arrow--next"
          onClick={onNext}
          aria-label="Next image"
        >
          &#8250;
        </button>
      </div>
    </div>
  );
}

type ViewMode = 'winners' | 'all';

export default function Gallery() {
  const [winnersPhotos, setWinnersPhotos] = useState<GalleryPhoto[]>([]);
  const [allPhotos, setAllPhotos] = useState<GalleryPhoto[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('winners');
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  const photos = viewMode === 'winners' ? winnersPhotos : allPhotos;

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      getGalleryPhotos(1, 100, { winnersOnly: true }),
      getGalleryPhotos(1, 100, { winnersOnly: false }),
    ])
      .then(([winnersRes, allRes]) => {
        setWinnersPhotos(winnersRes.items);
        setAllPhotos(allRes.items);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggle = useCallback((mode: ViewMode) => {
    if (mode === viewMode || switching) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setViewMode(mode);
      setCurrentPage(0);
      setSelectedIndex(null);
    } else {
      setSwitching(true);
      setTimeout(() => {
        setViewMode(mode);
        setCurrentPage(0);
        setSelectedIndex(null);
        setSwitching(false);
      }, 300);
    }
  }, [viewMode, switching]);

  const totalPages = Math.ceil(photos.length / PAGE_SIZE);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;
  const displayedPhotos = photos.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const goToNextPage = useCallback(() => {
    if (!hasNext || isPageTransitioning) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSlideDir('left');
      setCurrentPage((p) => p + 1);
    } else {
      setSlideDir('left');
      setPendingPage(currentPage + 1);
      setIsPageTransitioning(true);
    }
  }, [hasNext, isPageTransitioning, currentPage]);

  const goToPrevPage = useCallback(() => {
    if (!hasPrev || isPageTransitioning) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSlideDir('right');
      setCurrentPage((p) => p - 1);
    } else {
      setSlideDir('right');
      setPendingPage(currentPage - 1);
      setIsPageTransitioning(true);
    }
  }, [hasPrev, isPageTransitioning, currentPage]);

  const goToPrevPhoto = useCallback(() => {
    setSelectedIndex((i) =>
      i === null ? null : i === 0 ? photos.length - 1 : i - 1
    );
  }, [photos.length]);

  const goToNextPhoto = useCallback(() => {
    setSelectedIndex((i) =>
      i === null ? null : i === photos.length - 1 ? 0 : i + 1
    );
  }, [photos.length]);

  const handleClose = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev !== null) {
        setCurrentPage(Math.floor(prev / PAGE_SIZE));
      }
      return null;
    });
  }, []);

  const handleItemClick = (localIndex: number) => {
    setSelectedIndex(currentPage * PAGE_SIZE + localIndex);
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, localIndex: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleItemClick(localIndex);
    }
  };

  const gridClassName = [
    'gallery__grid',
    isPageTransitioning && slideDir === 'left' && 'gallery__grid--exit-left',
    isPageTransitioning && slideDir === 'right' && 'gallery__grid--exit-right',
    !isPageTransitioning && slideDir === 'left' && 'gallery__grid--slide-from-right',
    !isPageTransitioning && slideDir === 'right' && 'gallery__grid--slide-from-left',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id="gallery" className="gallery section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Gallery</h2>
          <p>A showcase of our members' best work</p>
          {!loading && !error && (
            <div className="gallery__toggle">
              <button
                className={`gallery__toggle-btn${viewMode === 'winners' ? ' gallery__toggle-btn--active' : ''}`}
                onClick={() => handleToggle('winners')}
              >
                Contest Winners
              </button>
              <button
                className={`gallery__toggle-btn${viewMode === 'all' ? ' gallery__toggle-btn--active' : ''}`}
                onClick={() => handleToggle('all')}
              >
                All Photos
              </button>
            </div>
          )}
        </div>

        {loading && (
          <div className="section-spinner">
            <div className="section-spinner__ring" />
          </div>
        )}

        {error && (
          <div className="section-error">
            <p>Something went wrong loading the gallery.</p>
            <button className="section-error__btn" onClick={loadData}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && photos.length === 0 && (
          <div className="gallery__empty fade-in-up">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <p>
              {viewMode === 'winners'
                ? 'Contest winners will be showcased here. Stay tuned!'
                : 'No submissions yet. Check back soon!'}
            </p>
          </div>
        )}

        {!loading && !error && photos.length > 0 && (
          <div className={`gallery__carousel fade-in-up${switching ? ' gallery__carousel--switching' : ''}`}>
            {hasPrev && (
              <button
                className="gallery__nav gallery__nav--prev"
                onClick={goToPrevPage}
                aria-label="Previous page"
              >
                &#8249;
              </button>
            )}

            <div
              className={gridClassName}
              key={currentPage}
              onAnimationEnd={() => {
                if (isPageTransitioning && pendingPage !== null) {
                  setCurrentPage(pendingPage);
                  setIsPageTransitioning(false);
                  setPendingPage(null);
                } else {
                  setSlideDir(null);
                }
              }}
            >
              {displayedPhotos.map((photo, i) => (
                <GalleryItem
                  key={photo.id}
                  photo={photo}
                  onClick={() => handleItemClick(i)}
                  onKeyDown={(e) => handleItemKeyDown(e, i)}
                  ariaLabel={`View ${photo.title} by ${photo.photographer}`}
                />
              ))}
              {totalPages > 1 &&
                Array.from({ length: PAGE_SIZE - displayedPhotos.length }, (_, i) => (
                  <div key={`placeholder-${i}`} className="gallery__item gallery__item--placeholder" aria-hidden="true" />
                ))}
            </div>

            {hasNext && (
              <button
                className="gallery__nav gallery__nav--next"
                onClick={goToNextPage}
                aria-label="Next page"
              >
                &#8250;
              </button>
            )}

            {totalPages > 1 && (
              <p className="gallery__page-indicator">
                Page {currentPage + 1} of {totalPages}
              </p>
            )}
          </div>
        )}
      </div>

      {selectedIndex !== null && (
        <GalleryLightbox
          photos={photos}
          index={selectedIndex}
          onClose={handleClose}
          onPrev={goToPrevPhoto}
          onNext={goToNextPhoto}
        />
      )}
    </section>
  );
}
