import React, { useId } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface BatchActionConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  affectedCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export const BatchActionConfirmDialog: React.FC<BatchActionConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  affectedCount,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}) => {
  const titleId = useId();
  const messageId = useId();
  const focusTrapRef = useFocusTrap<HTMLDivElement>(isOpen);

  useKeyboardShortcuts([
    { key: 'Escape', handler: () => onCancel() },
  ], isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 md3-dialog-scrim z-modal-top flex items-center justify-center p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="md3-dialog rounded-modal w-full max-w-md p-5 border border-md-sys-outline/20 animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div id={titleId} className="text-title font-bold">{title}</div>
        <p id={messageId} className="text-body-sm text-md-sys-on-surface/70 mt-2">{message}</p>
        <div className="mt-3 text-label-sm">
          <span className="opacity-60">Affected players:</span>{' '}
          <span className="font-mono font-bold">{affectedCount}</span>
        </div>
        <div className="md3-dialog-actions w-full justify-end mt-4">
          <button type="button" onClick={onCancel} className="md3-btn-text">
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className="md3-btn-filled">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
