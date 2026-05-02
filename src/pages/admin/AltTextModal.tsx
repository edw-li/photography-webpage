import { useState } from 'react';

interface AltTextModalProps {
  url: string;
  defaultAlt: string;
  onConfirm: (alt: string) => void;
  onCancel: () => void;
}

export default function AltTextModal({
  url,
  defaultAlt,
  onConfirm,
  onCancel,
}: AltTextModalProps) {
  // Parent renders this modal only when a fresh upload is pending and unmounts
  // it after Insert/Cancel, so initial state from props is always correct.
  const [alt, setAlt] = useState(defaultAlt);
  const [error, setError] = useState('');

  const submit = () => {
    const trimmed = alt.trim();
    if (!trimmed) {
      setError('Alt text is required (helps accessibility and email-blocking fallback)');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div
      className="confirm-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Image alt text"
    >
      <div
        className="confirm-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 480 }}
      >
        <h3 className="confirm-dialog__title">Image alt text</h3>
        <p className="confirm-dialog__message" style={{ marginBottom: '0.75rem' }}>
          Describe this image for accessibility and email clients that block external images.
        </p>
        <img
          src={url}
          alt="Preview"
          style={{
            maxWidth: '100%',
            maxHeight: 160,
            borderRadius: 4,
            display: 'block',
            margin: '0 auto 0.75rem',
          }}
        />
        <input
          autoFocus
          className="afm-input"
          value={alt}
          onChange={(e) => { setAlt(e.target.value); if (error) setError(''); }}
          placeholder="e.g. golden hour portrait"
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
          }}
          style={{ marginBottom: error ? 4 : '1rem' }}
        />
        {error && (
          <p style={{ color: 'var(--color-error, #e53e3e)', fontSize: '0.8rem', marginBottom: '1rem' }}>
            {error}
          </p>
        )}
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--confirm"
            onClick={submit}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
