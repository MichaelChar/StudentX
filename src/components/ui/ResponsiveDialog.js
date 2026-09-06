'use client';

import { useSyncExternalStore } from 'react';

import Modal from '@/components/ui/Modal';
import BottomSheet from '@/components/ui/BottomSheet';

/*
  ResponsiveDialog — a centre modal on desktop, a bottom sheet on a phone.

  This is backlog M6, which `Sheet.js` states as the intent: "Mobile's stand-in
  for a centre modal: filters, account menus, and confirmations that would be a
  Modal on desktop become a Sheet on a phone." A centre modal at 375px wastes
  the edges and reads as a desktop pattern shrunk down; a bottom sheet at
  1280px reads as a phone pattern stretched out.

  It exists as its own file because there are now two call sites — the booking
  widget's profile gate (Feature 59) and the report-listing dialog (Feature 41)
  — and the switch is subtle enough that two copies would drift. The same
  reasoning that moved the floating-control class string into
  `ui/floatingControl.js`.

  BOTH PRIMITIVES ARE UNTOUCHED BENEATH IT. Backdrop, focus trap, scroll lock,
  Escape and the history entry that makes mobile back close the overlay all
  come from Modal and Sheet; nothing is reimplemented here and nothing is
  passed, so none of it can drift from the primitives.

  The viewport is read with `useSyncExternalStore` rather than an effect: the
  obvious version reads `innerWidth` in an effect and calls setState, which
  trips this repo's `react-hooks/set-state-in-effect` rule and deserves to —
  it renders once at the wrong size and again at the right one.

  No SSR hazard in practice. Every current caller mounts this closed and opens
  it from a user action, which is necessarily after hydration; the server
  snapshot returns the narrow case anyway, as `Carousel` does.
*/

// `md` — the same breakpoint as the mobile tab bar, the chromeless PDP hero
// and the sticky booking bar. One line for the whole mobile treatment.
const DESKTOP_QUERY = '(min-width: 768px)';

function subscribeToViewport(onChange) {
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function readIsDesktop() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function readIsDesktopOnServer() {
  return false;
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {'sm'|'md'|'lg'} [props.size] desktop width only; a sheet is full-width
 * @param {React.ReactNode} props.children
 *   Everything else is spread onto the underlying dialog node, so
 *   `aria-labelledby` and friends work the same on both shapes.
 */
export default function ResponsiveDialog({
  open,
  onClose,
  size = 'md',
  children,
  ...rest
}) {
  /*
    All three arguments are module-level functions, so their identities never
    change and this never resubscribes. Wrapping the first in `useCallback` is
    what the obvious version does, and the React Compiler rejects it outright —
    `useCallback` wants an inline function expression, and a hoisted one is
    already as stable as a memo could make it.
  */
  const isDesktop = useSyncExternalStore(
    subscribeToViewport,
    readIsDesktop,
    readIsDesktopOnServer,
  );

  if (isDesktop) {
    return (
      <Modal open={open} onClose={onClose} size={size} {...rest}>
        {children}
      </Modal>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} {...rest}>
      {children}
    </BottomSheet>
  );
}
