import { useState, useEffect, useCallback, useRef } from 'react';
import type { GalleryPhoto, GalleryConfig } from '../types/gallery';
import { useImageLoaded } from '../hooks/useImageLoaded';
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
  const { loaded, handleLoad, handleError } = useImageLoaded(`${photo.url}/600/400`);
  return (
    <div
      className={`gallery__item${!loaded ? ' shimmer-bg' : ''}`}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
    >
      <img
        src={`${photo.url}/600/400`}
        alt={photo.title}
        loading="lazy"
        className={`img-fade${loaded ? ' img-fade--loaded' : ''}`}
        onLoad={handleLoad}
        onError={handleError}
      />
      <div className="gallery__overlay">
        <h3>{photo.title}</h3>
        <p>{photo.photographer}</p>
      </div>
    </div>
  );
}

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
  const exifText = formatExif(photo);
  const { loaded, handleLoad, handleError } = useImageLoaded(`${photo.url}/1200/800`);

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
      if (e.key === 'Escape') onClose();
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
      className="gallery__lightbox-backdrop"
      onClick={onClose}
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${photo.title} by ${photo.photographer}`}
    >
      <div className="gallery__lightbox" onClick={(e) => e.stopPropagation()}>
        <button
          className="gallery__lightbox-close"
          onClick={onClose}
          aria-label="Close lightbox"
          ref={closeRef}
        >
          &times;
        </button>
        <span className="gallery__lightbox-counter">
          {index + 1} / {photos.length}
        </span>
        <div className="gallery__lightbox-header">
          <strong>{photo.title}</strong>
          <span>{photo.photographer}</span>
        </div>

        <div className="gallery__lightbox-body">
          {!loaded && (
            <div className="gallery__lightbox-loading">
              <div className="section-spinner__ring" />
            </div>
          )}
          <img
            className={`gallery__lightbox-img img-fade${loaded ? ' img-fade--loaded' : ''}`}
            src={`${photo.url}/1200/800`}
            alt={photo.title}
            onLoad={handleLoad}
            onError={handleError}
          />
        </div>

        <span className={`gallery__lightbox-exif${exifText ? '' : ' gallery__lightbox-exif--empty'}`}>
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

export default function Gallery() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(false);
    import('../data/gallery.json')
      .then((mod) => {
        const config = (mod.default ?? mod) as GalleryConfig;
        setPhotos(config.gallery);
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

  const totalPages = Math.ceil(photos.length / PAGE_SIZE);
  const hasPrev = currentPage > 0;
  const hasNext = currentPage < totalPages - 1;
  const displayedPhotos = photos.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  const goToNextPage = useCallback(() => {
    if (!hasNext) return;
    setSlideDir('left');
    setCurrentPage((p) => p + 1);
  }, [hasNext]);

  const goToPrevPage = useCallback(() => {
    if (!hasPrev) return;
    setSlideDir('right');
    setCurrentPage((p) => p - 1);
  }, [hasPrev]);

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
    slideDir === 'left' && 'gallery__grid--slide-from-right',
    slideDir === 'right' && 'gallery__grid--slide-from-left',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section id="gallery" className="gallery section">
      <div className="container">
        <div className="section-title fade-in-up">
          <h2>Gallery</h2>
          <p>A showcase of our members' best work</p>
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

        {!loading && !error && (
          <div className="gallery__carousel fade-in-up">
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
              onAnimationEnd={() => setSlideDir(null)}
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
