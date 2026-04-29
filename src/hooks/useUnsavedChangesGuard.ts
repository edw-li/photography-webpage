import { useState, useEffect, useCallback } from 'react';

interface UnsavedChangesGuardResult {
  confirmingDiscard: boolean;
  attemptClose: () => void;
  confirmDiscard: () => void;
  cancelDiscard: () => void;
}

export default function useUnsavedChangesGuard(
  isDirty: boolean,
  onClose: () => void,
): UnsavedChangesGuardResult {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const attemptClose = useCallback(() => {
    if (isDirty) {
      setConfirmingDiscard(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const confirmDiscard = useCallback(() => {
    setConfirmingDiscard(false);
    onClose();
  }, [onClose]);

  const cancelDiscard = useCallback(() => {
    setConfirmingDiscard(false);
  }, []);

  return { confirmingDiscard, attemptClose, confirmDiscard, cancelDiscard };
}
