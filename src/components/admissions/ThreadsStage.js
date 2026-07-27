'use client';

import Threads from './Threads';

/*
  Dark stage with the Threads shader behind it.

  Shared by the hero and the closing CTA so the page bookends: the hero runs
  the shader normally, the closing section runs it flipped vertically, which
  mirrors the wave and reads as one continuous system rather than the same
  asset pasted twice.

  Why not one full-page canvas: Threads draws light lines onto a TRANSPARENT
  canvas, so it only reads on a dark parent. The middle sections are stone /
  parchment / iris-soft and would paint straight over a page-wide canvas. A
  true full-bleed shader requires committing the whole page to dark surfaces.

  Two WebGL contexts on one page is fine (browsers allow ~16), and each pauses
  itself via IntersectionObserver + document.hidden when off screen, so the
  second one costs nothing until it scrolls into view.

  Iris #635BFF as 0..1 floats for the shader's uColor uniform.
*/
const IRIS_RGB = [0.388, 0.357, 1.0];

const STAGE_FALLBACK = 'linear-gradient(165deg, #0a2540 0%, #10203c 55%, #1a1a4a 100%)';

// Scrim variants. Deliberately not full-bleed uniform overlays: measured, a
// 0.55→0.75 vertical scrim smothered the shader into invisibility. Each
// variant shields only where that section's text actually sits.
const SCRIMS = {
  // Hero: text is a left-aligned column, threads are densest on the right.
  left: 'linear-gradient(100deg, rgba(10,37,64,0.88) 0%, rgba(10,37,64,0.6) 38%, rgba(10,37,64,0) 72%)',
  // Closing CTA: text is centred, so shield the middle and let the edges run.
  center:
    'radial-gradient(ellipse 70% 65% at 50% 50%, rgba(10,37,64,0.9) 0%, rgba(10,37,64,0.65) 45%, rgba(10,37,64,0) 100%)',
};

export default function ThreadsStage({
  children,
  flip = false,
  scrim = 'left',
  className = '',
}) {
  return (
    <section
      className={`relative overflow-hidden ${className}`}
      style={{ background: STAGE_FALLBACK }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={flip ? { transform: 'scaleY(-1)' } : undefined}
      >
        <Threads color={IRIS_RGB} amplitude={1.1} distance={0.35} />
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: SCRIMS[scrim] }}
      />

      <div className="relative z-10">{children}</div>
    </section>
  );
}
