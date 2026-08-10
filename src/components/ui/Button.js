'use client';

import { Link } from '@/i18n/navigation';

/*
  Button — five variants, flat, sentence case.

  Rewritten for the Airbnb-structure parity work (see
  docs/airbnb-ui-parity-spec.md). StudentX keeps its own palette and typeface;
  what changed here is geometry, motion and the variant set.

    cta         gradient conversion CTA (.bg-brand). One per screen at most.
    primary     solid iris. The default.
    secondary   outline, night border.
    tertiary    underlined text, no border or fill.
    destructive irreversible or consequential actions.

  Three deliberate departures from the previous component:

  1. FLAT. The 3px `night` offset shadow that collapsed into a translate on
     hover is gone. It read as a different design language from the borderless
     cards and 8px controls around it.

  2. SENTENCE CASE. Labels are no longer `uppercase tracking-[0.08em]`.
     `.label-caps` stays the convention for micro-labels elsewhere; buttons are
     actions, not labels.

  3. NO WEBGL. `animated` no longer mounts `StripeGradientMesh` — a live shader
     per button, on phones too. It now maps to `cta`, which uses the existing
     `.bg-brand` CSS gradient (same iris → magenta → yellow stops) and scales
     slightly on hover. The prop is kept so its 9 call sites need no edit.

  Motion follows the system rule: only `background-color`, `border-color`,
  `color`, `opacity` and `transform` are animated — never a layout property.
  200ms / cubic-bezier(.455, .03, .515, .955).
*/

// Only transition what actually changes. `transition-all` is banned system-wide:
// it animates any changed property including layout, which is what makes hover
// smooth on a dev machine and stuttery on a mid-range Android.
const BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-semibold cursor-pointer ' +
  'transition-[background-color,border-color,color,transform,opacity] duration-200 ' +
  'ease-[cubic-bezier(.455,.03,.515,.955)] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

const LOOKS = {
  // .bg-brand carries the wordmark gradient and a flat-iris fallback.
  cta: 'bg-brand text-white border border-transparent hover:scale-[1.015] active:scale-100',
  primary:
    'bg-blue text-white border border-blue hover:bg-blue/90 active:bg-blue/80',
  secondary:
    'bg-transparent text-night border border-night/25 hover:bg-parchment hover:border-blue active:bg-parchment/70',
  tertiary:
    'bg-transparent text-night border border-transparent underline underline-offset-[3px] hover:text-blue active:text-blue/80',
  // `magenta` is StudentX's existing error/danger token — see Pill's `pending`
  // variant and the error text in landlord/reservations. Deliberately not a new
  // red: the palette is not being extended.
  destructive:
    'bg-transparent text-magenta border border-magenta/40 hover:bg-magenta/[0.06] hover:border-magenta active:bg-magenta/10',
};

/*
  Legacy variant names, kept as aliases so existing call sites render without
  edits. Counted at rewrite time:
    primary 17 · gold 11 · outline 12 · ghost 3 · no variant prop 24
    onDark 0 · outlineOnDark 0  ← deleted, not aliased
*/
const ALIASES = {
  gold: 'primary',
  outline: 'secondary',
  ghost: 'tertiary',
};

// Tertiary has no fill or border, so it gets tighter horizontal padding —
// otherwise it floats away from whatever it sits beside.
const SIZES = {
  sm: 'text-[13px] px-3.5 py-2 rounded-lg',
  md: 'text-sm px-5 py-3 rounded-lg',
  lg: 'text-[15px] px-7 py-4 rounded-lg',
};
const TERTIARY_SIZES = {
  sm: 'text-[13px] px-1.5 py-2 rounded-lg',
  md: 'text-sm px-2 py-3 rounded-lg',
  lg: 'text-[15px] px-2.5 py-4 rounded-lg',
};

export default function Button({
  href,
  variant = 'primary',
  size = 'md',
  animated = false,
  className = '',
  children,
  type,
  ...rest
}) {
  // `animated` predates the variant set; it exists only to request the gradient
  // CTA and is honoured here so its call sites keep working.
  const resolved = animated
    ? 'cta'
    : ALIASES[variant] || (LOOKS[variant] ? variant : 'primary');

  const sizeSet = resolved === 'tertiary' ? TERTIARY_SIZES : SIZES;
  const classes = `${BASE} ${LOOKS[resolved]} ${sizeSet[size] || sizeSet.md} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type || 'button'} className={classes} {...rest}>
      {children}
    </button>
  );
}
