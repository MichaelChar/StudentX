/*
  Pill — small, inert status label.

  Split from the old dual-purpose Pill during the parity work. This half keeps
  the status/label job; the interactive filter-chip job moved to `Chip`
  (see that file for why they are different objects).

  Variants — unchanged, because 27 call sites depend on these names and
  several compute them at runtime (`statusVariant(...)`, `gig.is_paid ?
  'verified' : 'info'`, and so on):

    verified  gold seal — VERIFIED and partner marks
    pending   magenta — needs someone to act
    amenity   parchment — neutral, the default
    info      iris — live / actioned

  `onDark` is deleted rather than aliased: zero call sites, same as Button's
  `onDark`/`outlineOnDark`.

  Two things changed:

  1. FULLY ROUND. `rounded-sm` (2px) → `rounded-full`, per the geometry
     decision. A 2px-radius pill is a rectangle.

  2. OPTIONAL DOT. Feature 50's listing status chips are deliberately
     asymmetric — `Listed` renders neutral with no dot, `Action required`
     renders magenta *with* one. Only the state that needs a response carries
     colour and a dot, so scanning a grid finds the listing that needs you
     rather than counting green chips.

  Case is unchanged: still uppercase at 0.15em, consistent with `.label-caps`.
  These are micro-labels, not actions — the sentence-case decision applies to
  Button, not here.
*/
const VARIANTS = {
  verified: 'bg-yellow text-white border-yellow',
  pending: 'bg-magenta text-white border-magenta',
  amenity: 'bg-parchment text-night border-parchment',
  info: 'bg-blue text-white border-blue',
};

export default function Pill({
  variant = 'amenity',
  dot = false,
  children,
  className = '',
  as: As = 'span',
}) {
  const cls = VARIANTS[variant] || VARIANTS.amenity;
  return (
    <As
      className={`inline-flex items-center gap-1.5 text-[0.65rem] font-sans font-semibold uppercase tracking-[0.15em] px-2.5 py-1 rounded-full border ${cls} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full bg-current shrink-0"
        />
      )}
      {children}
    </As>
  );
}
