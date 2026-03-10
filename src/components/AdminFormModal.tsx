import { useEffect, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import './AdminFormModal.css';

interface AdminFormModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  wide?: boolean;
  saveLabel?: string;
}

export default function AdminFormModal({
  title,
  children,
  onClose,
  onSave,
  saving = false,
  wide = false,
  saveLabel,
}: AdminFormModalProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, saving]);

  return (
    <div className="afm-overlay" onClick={saving ? undefined : onClose}>
      <div
        className={`afm-modal${wide ? ' afm-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="afm-header">
          <h3 className="afm-title">{title}</h3>
          <button className="afm-close" onClick={onClose} disabled={saving} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="afm-body">{children}</div>
        <div className="afm-footer">
          <button className="afm-btn afm-btn--cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="afm-btn afm-btn--save" onClick={onSave} disabled={saving}>
            {saving && <Loader2 size={14} className="afm-spinner" />}
            {saving ? (saveLabel ? `${saveLabel}ing...` : 'Saving...') : (saveLabel || 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
