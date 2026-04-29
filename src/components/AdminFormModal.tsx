import { useEffect, type ReactNode } from 'react';
import { X, Loader2 } from 'lucide-react';
import useUnsavedChangesGuard from '../hooks/useUnsavedChangesGuard';
import ConfirmDialog from './ConfirmDialog';
import './AdminFormModal.css';

interface AdminFormModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  wide?: boolean;
  saveLabel?: string;
  isDirty?: boolean;
}

export default function AdminFormModal({
  title,
  children,
  onClose,
  onSave,
  saving = false,
  wide = false,
  saveLabel,
  isDirty = false,
}: AdminFormModalProps) {
  const { confirmingDiscard, attemptClose, confirmDiscard, cancelDiscard } =
    useUnsavedChangesGuard(isDirty, onClose);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving) return;
      if (confirmingDiscard) cancelDiscard();
      else attemptClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [attemptClose, cancelDiscard, confirmingDiscard, saving]);

  return (
    <>
      <div className="afm-overlay" onClick={saving ? undefined : attemptClose}>
        <div
          className={`afm-modal${wide ? ' afm-modal--wide' : ''}`}
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="afm-header">
            <h3 className="afm-title">{title}</h3>
            <button className="afm-close" onClick={attemptClose} disabled={saving} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="afm-body">{children}</div>
          <div className="afm-footer">
            <button className="afm-btn afm-btn--cancel" onClick={attemptClose} disabled={saving}>
              Cancel
            </button>
            <button className="afm-btn afm-btn--save" onClick={onSave} disabled={saving}>
              {saving && <Loader2 size={14} className="afm-spinner" />}
              {saving ? (saveLabel ? `${saveLabel}ing...` : 'Saving...') : (saveLabel || 'Save')}
            </button>
          </div>
        </div>
      </div>
      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard unsaved changes?"
          message="You have unsaved edits. If you close this form now, your changes will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep Editing"
          danger
          onConfirm={confirmDiscard}
          onCancel={cancelDiscard}
        />
      )}
    </>
  );
}
