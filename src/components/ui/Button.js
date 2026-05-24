'use client';

import { Link } from '@/i18n/navigation';
import StripeGradientMesh from '@/components/property/StripeGradientMesh';

/*
  Neo-brutalist Button — brand palette (iris #635BFF on a #0a2540 hard shadow).

  Three visual looks; the legacy six-variant API is preserved by mapping each
  old variant name onto a look so all call sites render unchanged:
    - solid   : iris fill, white label, hard offset shadow that collapses on
                hover. Maps: primary, gold, animated, default.
    - outline : transparent fill, night border + ink label, same hard shadow
                + hover-collapse. Maps: outline, outlineOnDark, ghost.
    - onDark  : white fill, ink label, iris offset shadow — the inverted solid
                for night-toned surfaces. Maps: onDark.
  Sizes: sm | md | lg (unchanged padding/rounded).

  Pass `animated` to render the WebGL StripeGradientMesh as the button
  background instead of the flat iris fill — used on the primary conversion
  CTAs (quiz, sign in, create account). Its base look matches "solid".
*/
const BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.08em] uppercase transition-all cursor-pointer hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] disabled:opacity-50 disabled:cursor-not-allowed';

// Two brutalist looks in the brand palette. The 3px night offset shadow
// collapses on hover (handled in BASE) for the press-into-the-page feel.
const LOOKS = {
  solid:
    'bg-blue text-white font-medium shadow-[3px_3px_0px_#0a2540]',
  outline:
    'bg-transparent border border-night text-night shadow-[3px_3px_0px_#0a2540]',
  // Inverted solid for dark surfaces: white face + iris offset shadow so the
  // brutalist edge stays visible against a night-toned card.
  onDark:
    'bg-white text-night font-medium shadow-[3px_3px_0px_#635BFF]',
};

// Map the historical variant names onto the two looks.
const VARIANT_LOOK = {
  primary: 'solid',
  gold: 'solid',
  onDark: 'onDark',
  outline: 'outline',
  outlineOnDark: 'outline',
  ghost: 'outline',
};

// `animated` keeps the iris/solid base look; the gradient mesh layers on top.
const ANIMATED_LOOK = `relative overflow-hidden ${LOOKS.solid}`;

const SIZES = {
  sm: 'text-xs px-3 py-1.5 rounded',
  md: 'text-xs px-5 py-3 rounded',
  lg: 'text-sm px-7 py-4 rounded',
};

export default function Button({
  as = 'button',
  href,
  variant = 'primary',
  size = 'md',
  animated = false,
  className = '',
  children,
  type,
  ...rest
}) {
  const lookClasses = animated
    ? ANIMATED_LOOK
    : LOOKS[VARIANT_LOOK[variant] || 'solid'];
  const classes = `${BASE} ${lookClasses} ${SIZES[size] || SIZES.md} ${className}`;

  const content = animated ? (
    <>
      <span aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <StripeGradientMesh />
      </span>
      <span className="relative z-10 inline-flex items-center justify-center gap-2">
        {children}
      </span>
    </>
  ) : children;

  if (href) {
    return (
      <Link href={href} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type || 'button'} className={classes} {...rest}>
      {content}
    </button>
  );
}
