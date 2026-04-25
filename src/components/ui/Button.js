'use client';

import { Link } from '@/i18n/navigation';

/*
  Propylaea Button.
  Variants:
    - primary  : AUTh blue filled (default CTA)
    - gold     : Seal gold filled — reserved for verified/primary conversion CTAs
    - outline  : Blue outline on stone
    - ghost    : No background, subtle hover
    - onDark   : Stone fill on Night surface (for dark hero)
  Sizes: sm | md | lg
*/
const BASE =
  'inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.08em] uppercase transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTS = {
  primary:
    'bg-blue text-white hover:bg-night',
  gold:
    'bg-gold text-white hover:bg-[#9a7209]',
  outline:
    'border border-blue text-blue bg-transparent hover:bg-blue hover:text-white',
  outlineOnDark:
    'border border-white/80 text-white bg-transparent hover:bg-white hover:text-night',
  ghost:
    'text-night hover:text-blue',
  onDark:
    'bg-stone text-night hover:bg-white',
};

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
  className = '',
  children,
  type,
  ...rest
}) {
  const classes = `${BASE} ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`;

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
