/*
  Shared class strings for /boarding, moved unchanged from the page so the
  interactive pieces use the same rhythm.
*/

// Muted body copy: the site's AA token for secondary text (#577), not a hex.
export const MUTED = 'text-night/70';
export const WRAP = 'mx-auto w-full max-w-[1120px] px-5';
export const DISPLAY = 'font-display leading-[1.08]';
export const H2 = `${DISPLAY} mb-4 text-[clamp(2rem,3.6vw,3.15rem)]`;
export const LABEL = 'mb-2.5 text-[13px] font-bold tracking-[0.02em] text-blue';
// Mirrors ui/Button (primary, md). Not that component itself: it renders
// next-intl's <Link>, and these are external links with a click intercept.
export const BTN =
  'inline-flex items-center justify-center gap-2 rounded-control px-5 py-3 ' +
  'text-sm font-sans font-semibold leading-normal no-underline cursor-pointer border ' +
  'transition-[background-color,border-color,color] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2';
// Ring colour comes from the site-wide iris default in globals.css; the
// variants below override it only where the ring would sit on blue.
export const BTN_PRIMARY = `${BTN} bg-blue text-white border-blue hover:bg-blue/90 active:bg-blue/80`;
// Inline text links (closing panel contact lines). Focus ring is the
// site-wide iris default.
export const LINK = 'text-night underline hover:text-blue';
export const SPLIT = 'grid items-center gap-12';
export const PANEL = 'rounded-[28px] bg-parchment p-9';
