'use client';

import { useEffect } from 'react';

/*
  useModalA11y — single source of truth for modal-dialog accessibility.

  Consolidates the focus-trap / Esc / scroll-lock / focus-restore logic that
  was previously copy-pasted across ConfirmDialog, ListingPreview,
  ListingLightbox, the practice Lightbox and the two report modals — three of
  which had silently drifted (missing traps, missing Esc, missing scroll lock)
  while still asserting `aria-modal="true"`. Everything modal now shares this
  one implementation, so the copies can't drift apart again.

  On activation it: remembers the currently-focused element, optionally locks
  body scroll, and moves focus into the dialog (to `initialFocusRef` if given,
  else the first focusable node). While active it: cycles Tab / Shift+Tab
  within the dialog and maps Esc to `onClose`. On teardown it: releases the
  listener, restores body scroll, and returns focus to the trigger.

  @param {React.RefObject<HTMLElement>} dialogRef - the element with role="dialog".
  @param {Object} opts
  @param {() => void} opts.onClose - called on Esc (see closeOnEscape).
  @param {boolean} [opts.active=true] - false makes the hook a no-op (for
    components that stay mounted and render null when closed, e.g. ConfirmDialog).
  @param {React.RefObject<HTMLElement>} [opts.initialFocusRef] - element to focus
    on open; falls back to the first focusable node in the dialog.
  @param {boolean} [opts.lockScroll=true] - lock body scroll while open.
  @param {boolean} [opts.closeOnEscape=true] - map Esc to onClose. Pass a
    computed value (e.g. `!busy`) to suppress Esc during a pending action while
    keeping the focus trap live.
  @param {boolean} [opts.trapFocus=true] - cycle Tab within the dialog.
  @param {boolean} [opts.escapeCapture=false] - listen in the capture phase, so
    Esc closes this dialog before any bubble-phase listener beneath it (used by
    the nested practice Lightbox).
*/
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useModalA11y(
  dialogRef,
  {
    onClose,
    active = true,
    initialFocusRef,
    lockScroll = true,
    closeOnEscape = true,
    trapFocus = true,
    escapeCapture = false,
  } = {},
) {
  useEffect(() => {
    if (!active) return undefined;

    const previouslyFocused = document.activeElement;

    let prevOverflow;
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    // Defer nothing — the dialog node is mounted by the time this effect runs.
    if (initialFocusRef?.current) {
      initialFocusRef.current.focus();
    } else {
      dialogRef.current
        ?.querySelector(FOCUSABLE_SELECTOR)
        ?.focus();
    }

    function onKeyDown(e) {
      if (closeOnEscape && e.key === 'Escape') {
        e.preventDefault();
        if (escapeCapture) e.stopPropagation();
        onClose?.();
        return;
      }
      if (!trapFocus || e.key !== 'Tab') return;

      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll(FOCUSABLE_SELECTOR);
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

    document.addEventListener('keydown', onKeyDown, escapeCapture);
    return () => {
      document.removeEventListener('keydown', onKeyDown, escapeCapture);
      if (lockScroll) document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, closeOnEscape, onClose]);
}
