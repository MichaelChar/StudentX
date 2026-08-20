'use client';

import { useId, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import useOverlay from '@/components/ui/overlay/useOverlay';
import { surfaceTransition } from '@/components/ui/overlay/motion';

/*
  Sheet — edge-anchored overlay. Mobile's stand-in for a centre modal
  (backlog M6): filters, account menus, and confirmations that would be
  a Modal on desktop become a Sheet on a phone.

  Same behaviour core as Modal (trap, scroll lock, Escape, backdrop,
  focus restore). The difference is purely geometric: the panel is
  glued to an edge and *slides* via `transform: translate`, never via
  `top` / `left` / `height`. `bottom` rounds only the top corners at
  `rounded-modal`; `right` is a full-height panel with no radius — it
  meets the viewport edge.

  Reduced motion drops the slide and keeps the scrim fade, matching
  Modal. History (backlog S8) is not wired — see useOverlay.js.

  `draggable` (backlog M3 / F9) adds drag-to-dismiss and a grab handle to the
  `bottom` side. It lives here rather than in a separate component because a
  draggable sheet differs from this one by a handle and a gesture — everything
  else (trap, lock, Escape, scrim, slide) is identical, and a near-duplicate
  would be two things to keep in sync. `BottomSheet.js` is the named wrapper.

  The gesture is `transform: y` only, and dismissal is decided on RELEASE from
  distance OR velocity — a fast short flick reads as intentional, a slow long
  drag that stops short does not, and judging on distance alone gets both
  wrong. Under reduced motion the handle stays (it is an affordance, not
  motion) but the sheet does not rubber-band.
*/

// Past this many px, or this release velocity, letting go dismisses.
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 500;

const SIDES = {
  bottom:
    'absolute inset-x-0 bottom-0 w-full max-h-[90dvh] overflow-y-auto ' +
    'overscroll-contain rounded-t-modal',
  right:
    'absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto ' +
    'overscroll-contain',
};

function sheetTransform(side, reduced) {
  if (side === 'right') {
    if (reduced) {
      return { initial: { x: 0 }, animate: { x: 0 }, exit: { x: 0 } };
    }
    return {
      initial: { x: '100%' },
      animate: { x: 0 },
      exit: { x: '100%' },
    };
  }
  if (reduced) {
    return { initial: { y: 0 }, animate: { y: 0 }, exit: { y: 0 } };
  }
  return {
    initial: { y: '100%' },
    animate: { y: 0 },
    exit: { y: '100%' },
  };
}

function SheetPanel({
  onClose,
  side,
  draggable,
  title,
  children,
  footer,
  initialFocusRef,
  closeOnBackdrop,
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
  });

  const labelledBy = title != null && title !== '' ? titleId : undefined;
  const sideClass = SIDES[side] || SIDES.bottom;
  // Drag is a bottom-sheet gesture. A right-side panel dragged vertically
  // would be nonsense, so the prop is ignored there rather than half-working.
  const canDrag = Boolean(draggable) && (side || 'bottom') === 'bottom';
  const transform = sheetTransform(side, reduced);

  return (
    <motion.div
      className="fixed inset-0 z-50"
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
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`z-10 bg-stone text-night p-6 ${sideClass} ${className}`}
        initial={transform.initial}
        animate={transform.animate}
        exit={transform.exit}
        transition={surfaceTransition}
        {...(canDrag
          ? {
              drag: 'y',
              // Up is pinned: a bottom sheet does not grow past its own top
              // edge. Down is elastic so the gesture feels attached.
              dragConstraints: { top: 0, bottom: 0 },
              dragElastic: { top: 0, bottom: 0.4 },
              onDragEnd: (_e, info) => {
                if (
                  info.offset.y > DISMISS_DISTANCE ||
                  info.velocity.y > DISMISS_VELOCITY
                ) {
                  onClose?.();
                }
              },
            }
          : {})}
        {...rest}
      >
        {canDrag && (
          // Decorative: the sheet is already dismissable by Escape, backdrop
          // and whatever close control the caller renders, so announcing a
          // drag affordance a keyboard user cannot operate would be noise.
          <div
            aria-hidden="true"
            className="mx-auto -mt-2 mb-4 h-1 w-10 shrink-0 rounded-full bg-night/20"
          />
        )}
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
    </motion.div>
  );
}

export default function Sheet({
  open = false,
  onClose,
  side = 'bottom',
  draggable = false,
  title,
  children,
  footer,
  initialFocusRef,
  closeOnBackdrop = true,
  className = '',
  ...rest
}) {
  const reduced = useReducedMotion();
  const resolvedSide = SIDES[side] ? side : 'bottom';

  return (
    <AnimatePresence>
      {open ? (
        <SheetPanel
          key={`sheet-${resolvedSide}`}
          onClose={onClose}
          side={resolvedSide}
          draggable={draggable}
          title={title}
          footer={footer}
          initialFocusRef={initialFocusRef}
          closeOnBackdrop={closeOnBackdrop}
          className={className}
          reduced={reduced}
          {...rest}
        >
          {children}
        </SheetPanel>
      ) : null}
    </AnimatePresence>
  );
}
