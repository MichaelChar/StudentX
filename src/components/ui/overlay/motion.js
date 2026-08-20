/*
  Shared motion numbers for the overlay family.

  250ms is the large-surface duration from F5 (modals, sheets). Popover
  and Tooltip use the 200ms default. The cubic-bezier is `--ease-parity`.

  These live here rather than as a Tailwind `duration-250` class because
  enter/exit is driven by `motion`, not a CSS transition. F5 left
  `duration-250` as a per-site class that was never added as a token
  (Tailwind v4's default scale jumps 200 → 300). Putting the number next
  to the variants keeps the two surfaces in sync without a globals.css
  edit that would change every existing `transition-*`.
*/

export const PARITY_EASE = [0.455, 0.03, 0.515, 0.955];
export const SURFACE_MS = 0.25;
export const DEFAULT_MS = 0.2;

export const surfaceTransition = {
  duration: SURFACE_MS,
  ease: PARITY_EASE,
};

export const defaultTransition = {
  duration: DEFAULT_MS,
  ease: PARITY_EASE,
};
