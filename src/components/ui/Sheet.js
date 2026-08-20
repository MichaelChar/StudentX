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
*/

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
    </motion.div>
  );
}

export default function Sheet({
  open = false,
  onClose,
  side = 'bottom',
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
