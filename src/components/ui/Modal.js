'use client';

import { useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import useOverlay from '@/components/ui/overlay/useOverlay';
import { surfaceTransition } from '@/components/ui/overlay/motion';

/*
  Modal — centre-screen dialog.

  Supersedes the hand-rolled pattern in ConfirmDialog: same a11y contract
  (role=dialog, aria-modal, focus lands on initialFocusRef or the first
  focusable, Escape closes, backdrop click closes, trap + restore) but
  generalised into a shell. ConfirmDialog itself is not migrated here —
  that is a later PR.

  Geometry is the F4 modal role: `rounded-modal` (32px) on a `stone`
  surface. The backdrop is `night/40` plus a 2px blur — quieter than
  ConfirmDialog's `night/60` and enough to lift the card off the page
  without a shadow. Overlays get the one sanctioned elevation *or* a
  dimmed scrim, not both; the scrim is the modal's.

  Motion is opacity on the frame (the scrim fading) plus a small
  scale/translate on the card. 250ms / ease-parity. Reduced motion drops
  the transform and keeps the fade. Width/height/top/left are never
  animated.

  Not portalled. ConfirmDialog wasn't either, and a portal would be the
  first hydration-mismatch footgun in `ui/`. The cost is that a
  `transform`/`filter` ancestor becomes the containing block for
  `position: fixed` — call sites that render this inside a transformed
  parent should lift it. z-50 matches ConfirmDialog and the navbar; DOM
  order (this mounts after the navbar in typical trees) is what stacks
  it on top.

  History (backlog S8) is intentionally not wired — see useOverlay.js.
*/

export const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

const FRAME = 'fixed inset-0 z-50';

const PANEL =
  'relative z-10 w-full bg-stone text-night rounded-modal ' +
  'max-h-[calc(100vh-2rem)] overflow-y-auto overscroll-contain p-6';

function ModalPanel({
  onClose,
  title,
  children,
  footer,
  size,
  initialFocusRef,
  closeOnBackdrop,
  historyEntry,
  className,
  reduced,
  ...rest
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const { onBackdropClick } = useOverlay({
    open: true,
    onClose,
    rootRef: dialogRef,
    initialFocusRef,
    lockScroll: true,
    trapFocus: true,
    closeOnEscape: true,
    closeOnOutsideClick: false,
    closeOnBackdrop,
    // S8 — back closes the dialog instead of leaving the page. Opt out with
    // `historyEntry={false}` for a dialog that must not be dismissible by a
    // back gesture.
    historyEntry,
  });

  const labelledBy = title != null && title !== '' ? titleId : undefined;
  const sizeClass = SIZES[size] || SIZES.md;

  return (
    <motion.div
      className={FRAME}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={surfaceTransition}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-night/40 backdrop-blur-[2px]"
        onClick={onBackdropClick}
      />
      {/*
        pointer-events-none on the centering row so clicks in the padding
        around the card fall through to the backdrop. The card re-enables
        them. Without this, the p-4 gutter eats backdrop clicks.
      */}
      <div className="absolute inset-0 z-10 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={`${PANEL} ${sizeClass} pointer-events-auto ${className}`}
          initial={reduced ? { scale: 1, y: 0 } : { scale: 0.98, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          exit={reduced ? { scale: 1, y: 0 } : { scale: 0.98, y: 8 }}
          transition={surfaceTransition}
          {...rest}
        >
          {title != null && title !== '' && (
            <h2
              id={titleId}
              className="font-display text-2xl text-night leading-tight"
            >
              {title}
            </h2>
          )}
          <div className={title != null && title !== '' ? 'mt-3' : ''}>
            {children}
          </div>
          {footer ? <div className="mt-6">{footer}</div> : null}
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function Modal({
  open = false,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  closeOnBackdrop = true,
  historyEntry = true,
  className = '',
  ...rest
}) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open ? (
        <ModalPanel
          key="modal"
          onClose={onClose}
          title={title}
          footer={footer}
          size={size}
          initialFocusRef={initialFocusRef}
          closeOnBackdrop={closeOnBackdrop}
          historyEntry={historyEntry}
          className={className}
          reduced={reduced}
          {...rest}
        >
          {children}
        </ModalPanel>
      ) : null}
    </AnimatePresence>
  );
}
