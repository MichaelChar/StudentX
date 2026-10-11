// Homepage hero illustration opacity.
//
// The curve is the one HomeHero has always used:
//   1 - (scrollY / (viewportHeight * 0.8)) * 0.86
// clamped to [0.14, 1]. 0.14 is the deliberate watermark floor — the
// drawing never disappears completely as the page scrolls over it.
//
// Hydration mismatch: the server has no window, so the hero rendered with
// an assumed viewport of 800px. At scroll 0 that is opacity 1. In the
// browser window.innerHeight can be 0 — a background or hidden tab, a
// prerendered page, an embedded pane before layout. Then
// 0 / (0 * 0.8) is NaN, Math.max(0.14, NaN) is NaN, and React logs a
// hydration mismatch (server opacity "1", client opacity NaN). Any
// viewport that is not a finite number greater than 0 falls back to 800,
// the same value the server already assumes, so the two renders agree.
// That 800 is not a tuned constant: it has to stay equal to the server's
// assumption, or the mismatch comes back.

const SERVER_VIEWPORT_HEIGHT = 800;

export function heroFade(scrollY, viewportHeight) {
  const y = Number.isFinite(scrollY) ? scrollY : 0;
  const vh = Number.isFinite(viewportHeight) && viewportHeight > 0
    ? viewportHeight
    : SERVER_VIEWPORT_HEIGHT;
  const opacity = 1 - (y / (vh * 0.8)) * 0.86;
  return Math.min(1, Math.max(0.14, opacity));
}
