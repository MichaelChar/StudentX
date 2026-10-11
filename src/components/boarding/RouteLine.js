'use client';

import { useEffect, useRef } from 'react';
import { animate, inView } from 'motion';

const EASE = [0.455, 0.03, 0.515, 0.955];
const D = 'M 28 50 Q 150 -6 292 96';

/*
  Switzerland → Thessaloniki, drawn once when the figure scrolls in. The
  server HTML is the finished route (no dash offset, end dot visible). The
  effect rewinds it, then draws. Reduced motion and a mid-page reload leave
  that finished route alone.

  Decorative: the guide paragraph already says this in words.
*/
export default function RouteLine({ from, to }) {
  const figRef = useRef(null);
  const maskRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    const fig = figRef.current;
    const mask = maskRef.current;
    const end = endRef.current;
    if (!fig || !mask || !end) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    // Already on screen (e.g. reload mid-page): leave it drawn rather than blink it out.
    if (fig.getBoundingClientRect().top < window.innerHeight) return undefined;
    const len = mask.getTotalLength();
    mask.style.strokeDasharray = `${len}`;
    mask.style.strokeDashoffset = `${len}`;
    end.style.opacity = '0';
    let started = false;
    let draw;
    let pop;
    const stop = inView(
      fig,
      () => {
        if (started) return;
        started = true;
        // FLAG(review): animate(mask, { strokeDashoffset }) writes the SVG
        // attribute and leaves this inline style where it is, so the stroke
        // never moves (measured on motion 12.40). animate(fn, options) does
        // not call fn either. The sequence segment is the callback that
        // receives progress 0→1; writing the style is what the mask follows.
        draw = animate([
          [(p) => {
            mask.style.strokeDashoffset = String(len * (1 - p));
          }, { duration: 1.4, ease: EASE }],
        ]);
        // FLAG(review): the same attribute-vs-style split hides the end dot.
        // animate(end, { opacity }) sets the presentation attribute, and the
        // inline opacity above stays 0, so the dot never appears. Transform
        // does land on the CSS style; opacity has to be written here too.
        pop = animate(0, 1, {
          delay: 1.25,
          duration: 0.35,
          ease: EASE,
          onUpdate: (p) => {
            end.style.opacity = String(p);
            end.style.transform = `scale(${0.4 + 0.6 * p})`;
          },
        });
      },
      { amount: 0.5 },
    );
    return () => {
      stop();
      draw?.stop();
      pop?.stop();
      mask.style.strokeDasharray = '';
      mask.style.strokeDashoffset = '';
      end.style.opacity = '';
      // FLAG(review): the spec's cleanup resets opacity only. The pop also
      // writes transform, so a remount would otherwise keep a mid-scale dot.
      end.style.transform = '';
    };
  }, []);

  return (
    <figure ref={figRef} aria-hidden="true">
      <svg viewBox="0 0 320 132" className="mt-8 block h-auto w-full max-w-[340px]">
        <defs>
          <mask id="boarding-route-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="132">
            <path ref={maskRef} d={D} fill="none" stroke="white" strokeWidth="10" strokeLinecap="round" />
          </mask>
        </defs>
        <path
          d={D}
          fill="none"
          className="stroke-blue"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="0.1 9"
          mask="url(#boarding-route-mask)"
        />
        <circle cx="28" cy="50" r="6" className="fill-blue" />
        <circle
          ref={endRef}
          cx="292"
          cy="96"
          r="7"
          className="fill-yellow stroke-blue"
          strokeWidth="2"
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
        />
        <text x="28" y="76" textAnchor="start" className="fill-night/70 text-[13px] font-semibold">
          {from}
        </text>
        <text x="292" y="124" textAnchor="end" className="fill-night/70 text-[13px] font-semibold">
          {to}
        </text>
      </svg>
    </figure>
  );
}
