'use client';

import Threads from './Threads';
import CtaButton from './CtaButton';

/*
  Admissions hero — Threads WebGL background over a dark stage.

  Threads draws alpha-blended lines onto a TRANSPARENT canvas, so the parent
  supplies the colour. The inline background gradient is the static fallback
  that covers all four failure modes at once: WebGL unavailable, context
  creation failed, JS disabled, and the pre-hydration server HTML. Never
  remove it — without it a WebGL failure yields a blank rectangle.

  Iris #635BFF as 0..1 floats for the shader's uColor uniform.
*/
const IRIS_RGB = [0.388, 0.357, 1.0];

const STAGE_FALLBACK = 'linear-gradient(165deg, #0a2540 0%, #10203c 55%, #1a1a4a 100%)';

export default function AdmissionsHero({
  eyebrow,
  headline,
  subhead,
  ctaPrimary,
  ctaSecondary,
}) {
  return (
    <section
      className="relative overflow-hidden min-h-[92svh] flex items-center"
      style={{ background: STAGE_FALLBACK }}
    >
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
        <Threads color={IRIS_RGB} amplitude={1.1} distance={0.35} />
      </div>

      {/*
        Scrim. Deliberately HORIZONTAL, not full-bleed: the threads are densest
        on the right, and a uniform overlay heavy enough to guarantee contrast
        smothers them into invisibility (measured — a 0.55→0.75 vertical scrim
        made the shader effectively disappear). This protects the left text
        column and leaves the right side clear.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(100deg, rgba(10,37,64,0.88) 0%, rgba(10,37,64,0.6) 38%, rgba(10,37,64,0) 72%)',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-5xl px-5 py-24 md:py-32">
        <p className="font-display text-sm md:text-base uppercase tracking-[0.18em] text-white/60">
          {eyebrow}
        </p>

        <h1 className="mt-5 font-display text-4xl md:text-6xl lg:text-[4.25rem] leading-[1.05] text-white max-w-3xl">
          {headline}
        </h1>

        <p className="mt-6 text-lg md:text-xl leading-relaxed text-white/75 max-w-2xl">
          {subhead}
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <CtaButton>{ctaPrimary}</CtaButton>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center rounded-full px-8 py-4 text-lg font-display font-semibold text-white border-2 border-white/35 hover:border-white/70 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 outline-white focus-visible:outline-white"
          >
            {ctaSecondary}
          </a>
        </div>
      </div>
    </section>
  );
}
