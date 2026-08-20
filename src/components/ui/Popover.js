'use client';

import { cloneElement, isValidElement, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import useOverlay from '@/components/ui/overlay/useOverlay';
import { defaultTransition } from '@/components/ui/overlay/motion';

/*
  Popover — small anchored panel (account menu, filter dropdown).

  Not modal. Reuses the overlay core for Escape and outside-click, and
  sits on the overlay stack so Esc closes *this* before a parent Modal.
  It does not lock body scroll and does not trap focus — those would
  freeze the page under an account menu. Focus leaving the wrapper
  (Tab-ing out) also closes it; that's popover-specific and lives here
  rather than in the core.

  Positioning is plain CSS `absolute` relative to the trigger wrapper.
  Flip-free by design: no floating-ui, no collision detection. If the
  panel overflows the viewport the caller picks a different `placement`.
  Adding a positioning library for this would be the first new
  dependency in `ui/` and is exactly what the brief forbids.

  `role` is the caller's choice. A popover is not inherently a menu —
  the same shell serves a filter list (`listbox`), a menu, or an
  unlabelled panel. We set `aria-haspopup` / `aria-expanded` on the
  trigger to match.

  Elevation is the one sanctioned shadow from the parity spec. Radius
  is `rounded-card` (20px), surface is `stone`.
*/

export const PLACEMENTS = {
  'bottom-start': 'top-full left-0 mt-1.5',
  'bottom-end': 'top-full right-0 mt-1.5',
  'top-start': 'bottom-full left-0 mb-1.5',
  'top-end': 'bottom-full right-0 mb-1.5',
};

const ELEVATION =
  'shadow-[0_1px_2px_rgba(0,0,0,.08),0_4px_12px_rgba(0,0,0,.05)]';

const PANEL =
  `absolute z-50 min-w-[12rem] bg-stone text-night rounded-card p-2 ${ELEVATION}`;

function haspopupFor(role) {
  if (role === 'menu') return 'menu';
  if (role === 'listbox') return 'listbox';
  if (role === 'tree') return 'tree';
  if (role === 'grid') return 'grid';
  if (role === 'dialog') return 'dialog';
  return true;
}

function assignRef(ref, value) {
  if (typeof ref === 'function') ref(value);
  else if (ref && typeof ref === 'object') ref.current = value;
}

function composeHandlers(theirs, ours) {
  return (event) => {
    if (typeof theirs === 'function') theirs(event);
    ours(event);
  };
}

function PopoverPanel({
  children,
  role,
  placement,
  className,
  reduced,
  ...rest
}) {
  const placeClass = PLACEMENTS[placement] || PLACEMENTS['bottom-start'];
  return (
    <motion.div
      role={role}
      className={`${PANEL} ${placeClass} ${className}`}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
      transition={defaultTransition}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export default function Popover({
  trigger,
  children,
  placement = 'bottom-start',
  open,
  onOpenChange,
  role,
  className = '',
  ...rest
}) {
  const reduced = useReducedMotion();
  const controlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isOpen = controlled ? open : uncontrolledOpen;
  const rootRef = useRef(null);

  function setOpen(next) {
    const value = typeof next === 'function' ? next(isOpen) : next;
    if (!controlled) setUncontrolledOpen(value);
    onOpenChange?.(value);
  }

  function toggle() {
    setOpen(!isOpen);
  }

  useOverlay({
    open: isOpen,
    onClose: () => setOpen(false),
    rootRef,
    lockScroll: false,
    trapFocus: false,
    closeOnEscape: true,
    closeOnOutsideClick: true,
    restoreFocus: false,
  });

  const triggerProps = {
    'aria-haspopup': haspopupFor(role),
    'aria-expanded': isOpen,
    onClick: toggle,
  };

  let triggerNode;
  if (typeof trigger === 'function') {
    triggerNode = trigger({
      open: isOpen,
      toggle,
      setOpen,
      props: triggerProps,
    });
  } else if (isValidElement(trigger)) {
    const existingRef = trigger.props.ref ?? trigger.ref;
    triggerNode = cloneElement(trigger, {
      ...triggerProps,
      onClick: composeHandlers(trigger.props.onClick, toggle),
      ref: (node) => {
        assignRef(existingRef, node);
      },
    });
  } else {
    triggerNode = trigger;
  }

  function handleBlur(event) {
    const next = event.relatedTarget;
    if (next && rootRef.current?.contains(next)) return;
    if (next) setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative inline-flex" onBlur={handleBlur}>
      {triggerNode}
      <AnimatePresence>
        {isOpen ? (
          <PopoverPanel
            key="popover"
            role={role}
            placement={placement}
            className={className}
            reduced={reduced}
            {...rest}
          >
            {children}
          </PopoverPanel>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
