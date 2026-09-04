/*
  The round translucent control that sits directly ON a photograph.

  `FavoriteButton`'s iconless variant invented this treatment for the heart on
  a result card. Feature 58 needs the same shape three more times — back,
  share and heart, floating on the chromeless mobile PDP hero — so the string
  lives here rather than being copied and then quietly drifting apart.

  Deliberately excludes the focus-ring COLOUR. Each control keeps its own
  (magenta for save, blue for everything else), which is the one part of the
  treatment that legitimately differs.
*/
export const FLOATING_CONTROL =
  'inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/85 backdrop-blur-sm ' +
  'shadow-[0_1px_6px_-1px_rgba(10,20,54,0.3)] transition-[transform,background-color] ' +
  'hover:bg-white hover:scale-105 active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2';
