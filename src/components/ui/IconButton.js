'use client';

/*
  IconButton — circular icon-only control.

  The heart on a listing card, lightbox close, carousel arrows. An icon-only
  button with no accessible name is a bug, so `label` is required and becomes
  `aria-label`. Callers that already render visible text beside the icon
  should use Button, not this.

  Variants:

    ghost    quiet on a light surface. Recedes until hovered.
    solid    night fill. Reads as a button at rest, without spending `blue`
             (same restraint as Chip: brand colour is for the CTA).
    onPhoto  the treatment already in the wild on FavoriteButton: translucent
             white over an image, sanctioned soft shadow, backdrop blur.
             The only variant that sits on photography.

  onPhoto overrides the global iris focus ring with white — iris-on-photo is
  the case F11 called out as the worst of the three. Ghost/solid keep iris.

  Four states on every variant. Pressed vocabulary from Button.js:

    solid fill   hover:bg-X/90  → active:bg-X/80
    quiet        hover:bg-parchment → active:bg-night/10
    scale-lift   hover:scale-105 → active:scale-100

  Motion: only colour, transform and opacity. Duration/easing inherit the
  global 200ms / ease-parity defaults — spelling them out here would be a
  second copy to keep in sync (same as Button).
*/

const BASE =
  'inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden cursor-pointer ' +
  'transition-[background-color,border-color,color,transform,opacity] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const SIZES = {
  sm: 'w-8 h-8', // 32px
  md: 'w-9 h-9', // 36px — FavoriteButton's heart
  lg: 'w-11 h-11', // 44px — ListingLightbox arrows
};

const LOOKS = {
  ghost:
    'bg-transparent text-night hover:bg-parchment active:bg-night/10 ' +
    'focus-visible:outline-blue',
  solid:
    'bg-night text-stone hover:bg-night/90 active:bg-night/80 ' +
    'focus-visible:outline-blue',
  // Shadow string is copied from FavoriteButton — the sanctioned photo-overlay
  // elevation, not a new one. White focus ring: this control sits on an image.
  onPhoto:
    'bg-white/85 text-night backdrop-blur-sm ' +
    'shadow-[0_1px_6px_-1px_rgba(10,20,54,0.3)] ' +
    'hover:bg-white hover:scale-105 active:bg-white active:scale-100 ' +
    'focus-visible:outline-white',
};

export default function IconButton({
  label,
  children,
  size = 'md',
  variant = 'ghost',
  disabled = false,
  className = '',
  type = 'button',
  ...rest
}) {
  const look = LOOKS[variant] || LOOKS.ghost;
  const box = SIZES[size] || SIZES.md;
  // Native `title` tooltips need hover, so skip pointer-events-none when the
  // caller passed one. Same rule as F11: disabled:pointer-events-none ONLY
  // when the control has no tooltip.
  const pointerNone =
    disabled && rest.title == null ? 'disabled:pointer-events-none' : '';

  return (
    <button
      type={type}
      {...rest}
      aria-label={label}
      disabled={disabled}
      className={`${BASE} ${look} ${box} ${pointerNone} ${className}`}
    >
      {children}
    </button>
  );
}
