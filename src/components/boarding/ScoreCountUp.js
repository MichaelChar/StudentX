'use client';

import { useEffect, useRef } from 'react';
import { animate, inView } from 'motion';
import { splitScore } from '@/lib/boardingPath';

const EASE = [0.455, 0.03, 0.515, 0.955];

/*
  Counts the chip's score up from 0 once, the first time it is mostly on
  screen. The server HTML already says "43/45", so search engines, no-JS
  visitors and reduced-motion visitors get the real number. Screen readers
  get the full sentence from the sr-only copy; the animated one is
  aria-hidden, so they never hear "12/45".

  The number span's text is written directly from the effect. React never
  re-renders it (the prop is static), so the DOM write cannot be clobbered.
*/
export default function ScoreCountUp({ text }) {
  const numRef = useRef(null);
  const parts = splitScore(text);
  const to = parts?.to;

  useEffect(() => {
    const el = numRef.current;
    if (!el || to == null) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let started = false;
    let controls;
    const stop = inView(
      el,
      () => {
        if (started) return;
        started = true;
        controls = animate(0, to, {
          duration: 1.2,
          ease: EASE,
          onUpdate: (v) => {
            el.textContent = String(Math.round(v));
          },
        });
      },
      { amount: 0.6 },
    );
    return () => {
      stop();
      controls?.stop();
      el.textContent = String(to);
    };
  }, [to]);

  if (!parts) return text;

  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {parts.before}
        {/* The invisible copy sizes the slot to the real "43", so there is no
            gap before it; `ch` (the width of "0") was wider than "43" in this
            font. The counting digits sit on top, right-aligned. */}
        <span className="relative inline-block tabular-nums">
          <span className="invisible select-none">{parts.to}</span>
          <span ref={numRef} className="absolute inset-y-0 right-0">
            {parts.to}
          </span>
        </span>
        /{parts.of}
        {parts.after}
      </span>
    </>
  );
}
