'use client';

import { useRef } from 'react';

/*
  SegmentedControl — list/map and filter toggles, as a radio group.

  The two in-the-wild implementations (property results, gigs results) are
  the same control drawn twice: a row of buttons, one selected. Property
  fills the selected segment with `night`; gigs fills it with `blue`. Night
  is the one that survives — same reasoning as Chip: a row of segments all
  going iris makes the brand colour meaningless. `blue` stays for the
  focus ring and the CTA.

  Geometry is a hybrid of the two call sites: property's night fill, gigs'
  inset track (`p-0.5` on a bordered rounded-control). Flush
  overflow-hidden (property) makes the selected fill run to the border and
  look like a joined toggle; the inset track reads as a single control
  with a sliding thumb, which is what this primitive is for.

  Keyboard is a radio group, not a toolbar:
    - Tab enters/leaves once (roving tabindex on the checked segment)
    - Arrows move AND select, wrapping
    - Home / End jump to the ends
  Space/Enter also select the focused segment, for the case where the
  checked value and the focused segment have drifted (they shouldn't).

  Sentence case, like Chip and Button — these are actions, not micro-labels.
  Property results currently uses `.label-caps`; that is the call site's
  look, not this primitive's.
*/

const TRACK =
  'inline-flex items-stretch rounded-control border border-night/15 bg-white p-0.5';

const SEGMENT =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap ' +
  'font-sans font-medium cursor-pointer select-none border-0 rounded-control ' +
  'transition-[background-color,color] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const SIZES = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-3.5 py-2',
};

const STATES = {
  // Ink fill. Reads as "on" without spending the brand colour.
  on: 'bg-night text-stone hover:bg-night/90 active:bg-night/80',
  // Quiet. Hover AND pressed — four-state rule; property's toggle only had hover.
  off: 'bg-transparent text-night/60 hover:text-night hover:bg-parchment active:bg-night/10 active:text-night/80',
};

export default function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  label,
  disabled = false,
  className = '',
}) {
  const buttonRefs = useRef([]);
  const sizeClass = SIZES[size] || SIZES.md;
  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const tabbableIndex = selectedIndex >= 0 ? selectedIndex : 0;

  function activate(index) {
    const opt = options[index];
    if (!opt || disabled) return;
    buttonRefs.current[index]?.focus();
    if (opt.value !== value) onChange?.(opt.value);
  }

  function onKeyDown(event) {
    const count = options.length;
    if (!count || disabled) return;

    const current = buttonRefs.current.indexOf(event.currentTarget);
    const from = current >= 0 ? current : tabbableIndex;

    if (event.key === 'Home') {
      event.preventDefault();
      activate(0);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      activate(count - 1);
      return;
    }

    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!delta) return;
    event.preventDefault();
    activate((from + delta + count) % count);
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`${TRACK} ${className}`}
    >
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={disabled ? -1 : i === tabbableIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => activate(i)}
            onKeyDown={onKeyDown}
            className={`${SEGMENT} ${sizeClass} ${selected ? STATES.on : STATES.off}`}
          >
            {opt.icon ? (
              <span className="inline-flex shrink-0" aria-hidden="true">
                {opt.icon}
              </span>
            ) : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
