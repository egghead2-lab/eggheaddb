import { useState, useEffect, useRef } from 'react';

/**
 * Inline confirmation button. On first click, transforms into a "Confirm? / Cancel"
 * prompt right where the button was. Auto-cancels after 5 seconds of inactivity.
 *
 * Usage:
 *   <ConfirmButton onConfirm={() => deleteMutation.mutate(id)}>Delete</ConfirmButton>
 *
 * Props:
 *   - onConfirm: required handler called when user confirms
 *   - children: button label (default "Delete")
 *   - confirmLabel: confirm action label (default "Confirm")
 *   - cancelLabel: cancel action label (default "Cancel")
 *   - className: extra classes for the trigger button
 *   - disabled: disables both states
 *   - timeoutMs: auto-cancel timeout (default 5000, set to 0 to disable)
 */
export function ConfirmButton({
  onConfirm,
  children = 'Delete',
  confirmLabel = 'Confirm?',
  cancelLabel = 'Cancel',
  className = 'text-gray-300 hover:text-red-500 text-xs',
  disabled = false,
  timeoutMs = 5000,
}) {
  const [pending, setPending] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (pending && timeoutMs > 0) {
      timerRef.current = setTimeout(() => setPending(false), timeoutMs);
      return () => clearTimeout(timerRef.current);
    }
  }, [pending, timeoutMs]);

  const handleConfirm = (e) => {
    e.stopPropagation();
    setPending(false);
    onConfirm?.();
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setPending(false);
  };

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1 text-xs">
        <button type="button" onClick={handleConfirm} disabled={disabled}
          className="px-2 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white font-medium transition-colors">
          {confirmLabel}
        </button>
        <button type="button" onClick={handleCancel}
          className="px-2 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors">
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <button type="button" disabled={disabled}
      onClick={(e) => { e.stopPropagation(); setPending(true); }}
      className={className}>
      {children}
    </button>
  );
}
