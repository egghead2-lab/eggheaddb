import { useState, useEffect, useRef } from 'react';

/**
 * Inline confirmation button. On first click, transforms into a "Confirm? / Cancel"
 * prompt right where the button was. Auto-cancels after 5 seconds of inactivity.
 *
 * Usage:
 *   <ConfirmButton onConfirm={() => deleteMutation.mutate(id)}>Delete</ConfirmButton>
 *   <ConfirmButton tone="primary" size="md" onConfirm={() => send()}>Send All</ConfirmButton>
 *
 * Props:
 *   - onConfirm: required handler called when user confirms
 *   - children: button label (default "Delete")
 *   - confirmLabel: confirm action label (default "Confirm?")
 *   - cancelLabel: cancel action label (default "Cancel")
 *   - className: extra classes for the trigger button (overrides tone-based default)
 *   - disabled: disables both states
 *   - timeoutMs: auto-cancel timeout (default 5000, set to 0 to disable)
 *   - tone: 'destructive' (red Confirm? — for Delete/Remove/etc) | 'primary' (blue — for Send/Move/etc)
 *   - size: 'xs' (default, inline-style small text link) | 'md' (full Button-sized pill)
 */
export function ConfirmButton({
  onConfirm,
  children = 'Delete',
  confirmLabel = 'Confirm?',
  cancelLabel = 'Cancel',
  className,
  disabled = false,
  timeoutMs = 5000,
  tone = 'destructive',
  size = 'xs',
  ...rest
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

  const confirmBg = tone === 'primary'
    ? 'bg-[#1e3a5f] hover:bg-[#2d5a8e]'
    : 'bg-red-500 hover:bg-red-600';
  const pillSize = size === 'md' ? 'px-4 py-2 text-sm' : 'px-2 py-0.5 text-xs';
  const cancelSize = size === 'md' ? 'px-4 py-2 text-sm' : 'px-2 py-0.5 text-xs';
  const triggerDefault = tone === 'primary'
    ? (size === 'md'
        ? 'inline-flex items-center justify-center font-medium rounded transition-colors px-4 py-2 text-sm bg-[#1e3a5f] text-white hover:bg-[#2d5a8e] disabled:opacity-50 disabled:cursor-not-allowed'
        : 'text-[#1e3a5f] hover:underline text-xs font-medium')
    : 'text-gray-300 hover:text-red-500 text-xs';
  const triggerClass = className ?? triggerDefault;

  if (pending) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={handleConfirm} disabled={disabled}
          className={`${pillSize} rounded ${confirmBg} text-white font-medium transition-colors`}>
          {confirmLabel}
        </button>
        <button type="button" onClick={handleCancel}
          className={`${cancelSize} rounded bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors`}>
          {cancelLabel}
        </button>
      </span>
    );
  }

  return (
    <button type="button" disabled={disabled}
      onClick={(e) => { e.stopPropagation(); setPending(true); }}
      className={triggerClass}
      {...rest}>
      {children}
    </button>
  );
}
