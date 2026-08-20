/*
  Card — a generic surface: panel, tile, bordered block.

  NOT the listing card. That one is deliberately borderless and photo-first
  (parity Feature "Card frame — borderless, photo-as-card", shipped in #400 on
  ListingCard/GigCard). This component is the *other* thing the grid is made
  of — settings panels, empty states, dashboard tiles — where a bordered
  surface is still the right answer.

  Two things changed in the F7 rewrite:

  1. HOVER IS A TRANSFORM LIFT, NOT A SHADOW FADE. It used to be
     `transition-shadow hover:shadow-[...]`, which animates `box-shadow` — a
     property the F5 motion rule does not permit (only transform, opacity and
     colour may animate). Shadow interpolation repaints the blur on every
     frame, which is exactly the "smooth on a dev Mac, stuttery on a mid-range
     Android" failure F5 exists to prevent. The `transition-all` sweep in #397
     missed it because `transition-shadow` is a different utility, and the
     four-state audit missed it because `hover` has **zero call sites** — the
     branch was unreachable, so nothing rendered it.

     Kept rather than deleted because the parity spec calls for a transform
     lift on hoverable cards, and the guest-browse work (S9, P13) will want it.

  2. `stone` and `white` are the same colour. `--color-stone` IS #fff, so the
     two tones were always identical; `white` is what all 23 call sites use.
     Both are kept — aliasing them silently would be a rename disguised as a
     refactor — but they now point at one entry so they cannot drift.
*/
const WHITE = 'bg-white text-night';

const TONES = {
  parchment: 'bg-parchment text-night',
  night: 'bg-night text-stone',
  // Same value on purpose — see note 2 above.
  stone: WHITE,
  white: WHITE,
};

export default function Card({
  tone = 'parchment',
  hover = false,
  border = true,
  className = '',
  children,
  ...rest
}) {
  const borderCls = border
    ? tone === 'night'
      ? 'border border-white/10'
      : 'border border-night/10'
    : '';

  // Transform + shadow together, but only the transform animates: the shadow
  // is declared statically at both ends so there is nothing to interpolate.
  const hoverCls = hover
    ? 'transition-transform hover:-translate-y-0.5 active:translate-y-0 ' +
      'shadow-[0_1px_2px_rgba(10,20,54,0.08),0_4px_12px_rgba(10,20,54,0.05)]'
    : '';

  return (
    <div
      className={`${TONES[tone] || TONES.parchment} ${borderCls} ${hoverCls} rounded-card ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
