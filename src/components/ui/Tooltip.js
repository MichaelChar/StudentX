'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import useOverlay from '@/components/ui/overlay/useOverlay';
import { defaultTransition } from '@/components/ui/overlay/motion';

/*
  Tooltip — short, non-essential description of a control.

  Shows on hover (after `delay`, default 400ms) AND on keyboard
  `:focus-visible`. A tooltip that only works for mice is a bug: the
  point of `aria-describedby` is that a screen-reader user tabbing onto
  the control hears the same hint. Essential information must never
  live only in here — that is a call-site rule, not something a
  primitive can enforce.

  The bubble is `pointer-events-none` so moving the cursor toward it
  cannot keep it open or steal the hover. Disabled controls still
  tooltip because hover/focus live on the wrapping span, not on the
  (possibly `pointer-events-none`) child — matching the four-state
  rule that a disabled control keeps pointer events when it has a
  tooltip.

  Escape dismisses via the overlay stack, so a tooltip sitting inside
  a Modal consumes Esc before the modal does. No scroll lock, no trap,
  no focus restore: we never moved focus.

  Placement uses an outer absolutely-positioned wrapper for the CSS
  transform (`-translate-x-1/2` for centred sides) and an inner motion
  node for the opacity fade. Animating transform on the same node that
  is already translating to centre would fight.
*/

export const PLACEMENTS = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
  'top-start': 'bottom-full left-0 mb-1.5',
  'top-end': 'bottom-full right-0 mb-1.5',
  'bottom-start': 'top-full left-0 mt-1.5',
  'bottom-end': 'top-full right-0 mt-1.5',
};

const BUBBLE =
  'rounded-control bg-night text-stone text-xs leading-snug ' +
  'px-2.5 py-1.5 max-w-xs pointer-events-none';

export default function Tooltip({
  label,
  children,
  placement = 'top',
  delay = 400,
  className = '',
}) {
  const reduced = useReducedMotion();
  const tooltipId = useId();
  const rootRef = useRef(null);
  const timerRef = useRef(null);
  const [open, setOpen] = useState(false);

  function clearTimer() {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function hide() {
    clearTimer();
    setOpen(false);
  }

  useOverlay({
    open,
    onClose: hide,
    rootRef,
    lockScroll: false,
    trapFocus: false,
    closeOnEscape: true,
    closeOnOutsideClick: false,
    restoreFocus: false,
  });

  useEffect(() => {
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    };
  }, []);

  function showNow() {
    clearTimer();
    setOpen(true);
  }

  function showSoon() {
    clearTimer();
    if (delay <= 0) {
      setOpen(true);
      return;
    }
    timerRef.current = setTimeout(() => setOpen(true), delay);
  }

  function handleMouseEnter() {
    showSoon();
  }

  function handleMouseLeave() {
    const focused = rootRef.current?.querySelector(':focus-visible');
    if (focused) return;
    hide();
  }

  function handleFocus(event) {
    // Keyboard only. Mouse click on a button focuses it but typically
    // does not match :focus-visible; hover already covers that path.
    if (event.target.matches?.(':focus-visible')) showNow();
  }

  function handleBlur() {
    hide();
  }

  const child = isValidElement(children)
    ? Children.only(children)
    : children;

  const describedBy = open
    ? [isValidElement(child) ? child.props['aria-describedby'] : null, tooltipId]
        .filter(Boolean)
        .join(' ')
    : isValidElement(child)
      ? child.props['aria-describedby']
      : undefined;

  const triggerNode = isValidElement(child)
    ? cloneElement(child, {
        'aria-describedby': describedBy,
      })
    : child;

  const placeClass = PLACEMENTS[placement] || PLACEMENTS.top;

  if (label == null || label === '') {
    return triggerNode;
  }

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {triggerNode}
      <AnimatePresence>
        {open ? (
          <motion.span
            key="tooltip"
            className={`absolute z-50 ${placeClass}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduced ? { duration: 0 } : defaultTransition}
          >
            <span
              id={tooltipId}
              role="tooltip"
              className={`${BUBBLE} inline-block ${className}`}
            >
              {label}
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
