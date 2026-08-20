'use client';

import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';

/*
  Counter — stepper for guests, bedrooms, etc. (− value +).

  Two IconButtons around a live value, so the four-state and a11y rules live
  in one place; this file only owns the arithmetic and the group semantics.
  Disabled − at min and + at max is a visible state (opacity), not an
  omitted control — dropping a button would jump the row.

  The inner buttons are ghost IconButtons with a hairline border composed
  via className, matching Airbnb's outlined 32px circles. An `outline`
  variant was not added to IconButton: F8b specified ghost | solid | onPhoto.

  `decrementLabel` / `incrementLabel` are the IconButton accessible names.
  English defaults exist so the icon-only buttons always have a name;
  callers should pass translated strings (this primitive takes copy as
  props and has no message keys).

  Guards rather than trust: non-numeric value/step/min/max fall back to
  0 / 1 / 0 / Infinity. If min > max they swap. `step` of 0 or negative
  becomes its absolute value, or 1.
*/

function normalizeCounter({
  value,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
}) {
  const toNumber = (n, fallback) => {
    if (n == null || n === '') return fallback;
    const x = typeof n === 'number' ? n : Number(n);
    return Number.isFinite(x) ? x : fallback;
  };

  let minN = toNumber(min, 0);
  let maxN = toNumber(max, Number.POSITIVE_INFINITY);
  if (minN > maxN) {
    const swap = minN;
    minN = maxN;
    maxN = swap;
  }

  const rawStep = toNumber(step, 1);
  const stepN = rawStep === 0 ? 1 : Math.abs(rawStep);

  const current = toNumber(value, minN);
  const clamped = Math.min(maxN, Math.max(minN, current));

  return {
    min: minN,
    max: maxN,
    step: stepN,
    value: clamped,
    atMin: clamped <= minN,
    atMax: clamped >= maxN,
  };
}

const STEPPER_LOOK =
  'border border-night/25 hover:border-night active:bg-night/10';

export default function Counter({
  value,
  onChange,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  label,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  disabled = false,
  className = '',
}) {
  const n = normalizeCounter({ value, min, max, step });

  function bump(delta) {
    if (disabled) return;
    const next = Math.min(n.max, Math.max(n.min, n.value + delta));
    if (next !== n.value) onChange?.(next);
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={`inline-flex items-center gap-3 ${className}`}
    >
      <IconButton
        label={decrementLabel}
        size="sm"
        variant="ghost"
        disabled={disabled || n.atMin}
        onClick={() => bump(-n.step)}
        className={STEPPER_LOOK}
      >
        <Icon name="minus" className="w-4 h-4" />
      </IconButton>
      <span
        aria-live="polite"
        aria-atomic="true"
        className="min-w-[1.5rem] text-center font-sans text-sm tabular-nums text-night"
      >
        {n.value}
      </span>
      <IconButton
        label={incrementLabel}
        size="sm"
        variant="ghost"
        disabled={disabled || n.atMax}
        onClick={() => bump(n.step)}
        className={STEPPER_LOOK}
      >
        <Icon name="plus" className="w-4 h-4" />
      </IconButton>
    </div>
  );
}
