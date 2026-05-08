'use client';

import { Link } from '@/i18n/navigation';
import StripeGradientMesh from '@/components/property/StripeGradientMesh';

/*
  Propylaea Button.
  Variants:
    - primary  : AUTh blue filled (default CTA)
    - gold     : Seal gold filled — reserved for verified/primary conversion CTAs
    - outline  : Blue outline on stone
    - ghost    : No background, subtle hover
    - onDark   : Stone fill on Night surface (for dark hero)
  Sizes: sm | md | lg

  Pass `animated` to render the WebGL StripeGradientMesh as the button
  background instead of the variant's flat fill — used on the primary
  conversion CTAs (quiz, sign in, create account).
*/
const BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.08em] uppercase transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTS = {
  primary:
    'bg-brand text-white hover:opacity-90',
  gold:
    'bg-yellow text-white hover:opacity-90',
  outline:
    'border border-blue text-blue bg-transparent hover:bg-blue hover:text-white',
  outlineOnDark:
    'border border-white/80 text-white bg-transparent hover:bg-white hover:text-night',
  ghost:
    'text-night hover:text-blue',
  onDark:
    'bg-stone text-night hover:bg-white',
};

const ANIMATED_VARIANT = 'relative overflow-hidden text-white shadow-md hover:opacity-95';

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
  const variantClasses = animated ? ANIMATED_VARIANT : (VARIANTS[variant] || VARIANTS.primary);
  const classes = `${BASE} ${variantClasses} ${SIZES[size] || SIZES.md} ${className}`;

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
