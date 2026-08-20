'use client';

import { useEffect, useId, useRef } from 'react';

/*
  useOverlay — behaviour core for the F8 overlay family (Modal, Sheet,
  Popover, Tooltip).

  Why a new module rather than extending `src/lib/useModalA11y.js`: that
  hook is already the source of truth for ConfirmDialog, ListingPreview,
  ListingLightbox and the two report modals. Migrating them onto these
  primitives is a later PR (explicitly out of scope — doing it here would
  make the PR unreviewable). This core also adds three things
  useModalA11y does not have:

    1. A *stack counter* for body scroll-lock, so two open overlays don't
       restore overflow when the first one closes.
    2. An *overlay stack* so Escape / outside-click dismiss only the
       topmost layer, not every overlay at once.
    3. Outside-click, which a popover needs and a modal does not (modals
       close via an explicit backdrop node instead).

  Modal and Sheet consume the full core (trap + lock + Escape + backdrop).
  Popover reuses Escape + outside-click but not the trap or the lock — a
  popover is not modal, and trapping/locking would freeze the page under
  an account menu. Tooltip reuses Escape (and the stack, so Esc closes
  the tooltip before a parent modal) and nothing else.

  History (backlog S8, separate PR): treating an open Modal/Sheet as a
  history entry so the browser back button calls onClose rather than
  leaving the page would hook in *here* — pushState on activate, popstate
  → onClose. Left unimplemented on purpose.
*/

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let lockCount = 0;
let savedOverflow = '';

const overlayStack = [];

export function acquireScrollLock() {
  if (typeof document === 'undefined' || !document.body) return;
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
}

export function releaseScrollLock() {
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0 && typeof document !== 'undefined' && document.body) {
    document.body.style.overflow = savedOverflow;
  }
}

export function getFocusable(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR));
}

export function cycleFocus(event, root) {
  if (!root || event.key !== 'Tab') return;
  const focusable = getFocusable(root);
  if (focusable.length === 0) {
    event.preventDefault();
    if (typeof root.focus === 'function') root.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  const inList = focusable.includes(active);

  if (event.shiftKey) {
    if (!inList || active === first) {
      event.preventDefault();
      last.focus();
    }
  } else if (!inList || active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function handleOverlayKeyDown(event) {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  const cb = top.callbacks.current;

  if (event.key === 'Escape') {
    event.preventDefault();
    if (typeof event.stopPropagation === 'function') event.stopPropagation();
    // Consume Escape even when this layer has closeOnEscape=false (e.g. a
    // busy confirm), so it cannot leak through and dismiss the overlay
    // underneath.
    if (cb.closeOnEscape) cb.onClose?.();
    return;
  }

  if (cb.trapFocus && event.key === 'Tab') {
    cycleFocus(event, top.rootRef?.current);
  }
}

export function handleOverlayPointerDown(event) {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  const cb = top.callbacks.current;
  if (!cb.closeOnOutsideClick) return;
  const root = top.rootRef?.current;
  if (!root) return;
  if (typeof root.contains === 'function' && root.contains(event.target)) {
    return;
  }
  cb.onClose?.();
}

export function registerOverlay(entry) {
  overlayStack.push(entry);
  if (overlayStack.length === 1 && typeof document !== 'undefined') {
    document.addEventListener('keydown', handleOverlayKeyDown);
    // Capture so a popover closes before the outside click lands on
    // whatever is underneath. Click-through is still allowed — we do not
    // preventDefault.
    document.addEventListener('pointerdown', handleOverlayPointerDown, true);
  }
  return () => {
    const i = overlayStack.lastIndexOf(entry);
    if (i >= 0) overlayStack.splice(i, 1);
    if (overlayStack.length === 0 && typeof document !== 'undefined') {
      document.removeEventListener('keydown', handleOverlayKeyDown);
      document.removeEventListener(
        'pointerdown',
        handleOverlayPointerDown,
        true,
      );
    }
  };
}

export function isTopOverlay(id) {
  return overlayStack[overlayStack.length - 1]?.id === id;
}

/** @internal */
export function _resetOverlayStateForTests() {
  overlayStack.length = 0;
  lockCount = 0;
  savedOverflow = '';
}

/** @internal */
export function _getScrollLockCountForTests() {
  return lockCount;
}

/** @internal */
export function _getOverlayStackForTests() {
  return overlayStack;
}

export default function useOverlay({
  open,
  onClose,
  rootRef,
  initialFocusRef,
  lockScroll = false,
  trapFocus = false,
  closeOnEscape = true,
  closeOnOutsideClick = false,
  closeOnBackdrop = true,
  restoreFocus = true,
} = {}) {
  const overlayId = useId();
  const callbacks = useRef({
    onClose,
    closeOnEscape,
    trapFocus,
    closeOnOutsideClick,
    closeOnBackdrop,
  });

  // Keep the stack entry's callbacks current without re-running the
  // activate effect (which would re-trap and steal focus). The compiler
  // rule `react-hooks/refs` forbids writing `.current` during render.
  // Syncing in an effect is one paint behind; the initializer covers
  // first mount, and keydown/click cannot fire before paint anyway.
  useEffect(() => {
    callbacks.current.onClose = onClose;
    callbacks.current.closeOnEscape = closeOnEscape;
    callbacks.current.trapFocus = trapFocus;
    callbacks.current.closeOnOutsideClick = closeOnOutsideClick;
    callbacks.current.closeOnBackdrop = closeOnBackdrop;
  });

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused =
      typeof document !== 'undefined' ? document.activeElement : null;

    const entry = { id: overlayId, rootRef, initialFocusRef, callbacks };
    const unregister = registerOverlay(entry);
    if (lockScroll) acquireScrollLock();

    const node = rootRef?.current;
    const focusTarget =
      initialFocusRef?.current || (node && getFocusable(node)[0]) || node;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }

    return () => {
      unregister();
      if (lockScroll) releaseScrollLock();
      if (
        restoreFocus &&
        previouslyFocused &&
        typeof previouslyFocused.focus === 'function'
      ) {
        previouslyFocused.focus();
      }
    };
    // Re-run only when `open` flips. Callbacks live on a ref so a new
    // onClose identity doesn't re-trap and steal focus mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onBackdropClick() {
    if (!callbacks.current.closeOnBackdrop) return;
    if (!isTopOverlay(overlayId)) return;
    callbacks.current.onClose?.();
  }

  return { onBackdropClick, overlayId };
}
