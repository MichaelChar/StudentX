'use client';

/*
  Chip — interactive filter control.

  Split out of the old dual-purpose `Pill`, which was rendering two unrelated
  things: inert status labels (VERIFIED, New, Replied) and content/filter
  chips. They are different objects and want opposite treatments — a status
  label is a bold coloured micro-label you read, a filter chip is a quiet
  control you press. Conflating them meant neither could be right.

  Geometry is Airbnb's filter chip, measured on their live results page:
  34px tall, fully-round, 1px hairline border, 12px label, generous horizontal
  padding. Rendered in StudentX tokens.

  Sentence case, deliberately — unlike `Pill`. A chip is an action, and the
  same reasoning applies as for Button: uppercase reads as a label, not
  something you press.

  Selected state uses `night`, not `blue`. Airbnb fills the selected chip with
  its ink colour rather than its brand colour, and the same restraint applies
  here: a row of ten chips all going iris when active would make the brand
  colour meaningless. `blue` stays for the focus ring and the CTA.

  Motion follows the system rule — only colour and transform, never a layout
  property. 200ms / cubic-bezier(.455, .03, .515, .955).
*/

const BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap h-[34px] px-3.5 rounded-full ' +
  'font-sans text-xs cursor-pointer select-none border ' +
  'transition-[background-color,border-color,color] duration-200 ' +
  'ease-[cubic-bezier(.455,.03,.515,.955)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const STATES = {
  // Resting: white on the page, hairline border. Recedes until wanted.
  off: 'bg-white text-night border-night/20 hover:border-night/45 hover:bg-parchment',
  // Active: ink fill. Reads unmistakably as "on" without spending the brand colour.
  on: 'bg-night text-white border-night hover:bg-night/90',
};

export default function Chip({
  selected = false,
  onClick,
  children,
  className = '',
  disabled = false,
  ...rest
}) {
  return (
    <button
      type="button"
      // Toggle semantics: a filter chip is a two-state control, not a link or
      // a menu item. Screen readers announce "pressed"/"not pressed".
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`${BASE} ${selected ? STATES.on : STATES.off} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
