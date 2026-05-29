'use client';

import { useEffect, useId, useRef } from 'react';

/*
  Accessible confirm dialog — replaces native window.confirm() for
  destructive in-app actions.

  - Centered card on a dimmed night backdrop, parchment-toned surface.
  - Focus-trapped: Tab/Shift+Tab cycle within the dialog; focus lands on
    the Cancel button on open (safe default for destructive flows) and is
    restored to the previously-focused element on close.
  - Esc closes (mapped to onCancel). Backdrop click closes too, unless busy.
  - `destructive` renders the confirm button in red.

  Render conditionally by the parent (i.e. `{open && <ConfirmDialog … />}`)
  or pass `open` — both work; the component no-ops when `open === false`.
*/
export default function ConfirmDialog({
  open = true,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy = false,
  destructive = false,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();

  // Trap focus, wire Esc, and restore focus to the trigger on unmount.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    // Defer initial focus to after paint so the node exists.
    cancelRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) onCancel?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
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
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-night/60"
        onClick={() => (busy ? null : onCancel?.())}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-md rounded-sm border border-night/10 bg-parchment text-night p-6 md:p-7"
      >
        <h2
          id={titleId}
          className="font-display text-2xl text-night leading-tight"
        >
          {title}
        </h2>
        <p className="mt-3 text-sm text-night/70 leading-relaxed">{body}</p>

        <div className="mt-7 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onCancel?.()}
            disabled={busy}
            className="label-caps px-4 py-2.5 rounded-sm border border-night/20 text-night/70 hover:border-night hover:text-night transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.()}
            disabled={busy}
            className={`label-caps px-4 py-2.5 rounded-sm text-white transition-colors disabled:opacity-50 ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue hover:bg-night'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
