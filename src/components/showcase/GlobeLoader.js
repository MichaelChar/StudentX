'use client';

import { useEffect, useRef, useState } from 'react';
import { takeLoaderFlag } from './loaderFlag';

/*
  The GlobeLoader: a spinning globe that zooms into a sketch of central
  Thessaloniki, then pins the properties. About 4.6 s; a click or any key
  skips it.

  It plays ONLY when a property is opened from the homepage strips (his call,
  2026-11-23, demo v11): not on the homepage, the Map page, Featured
  properties or the MG² page's strips. The homepage strip sets a one-shot flag
  (loaderFlag.js) that this reads and clears on mount. Reduced motion: never.

  The city sketch's pins are the Map page's schematic positions.
*/
const MERIDIANS = 6;

const TIER2 = [
  ['M 50 134 Q 80 140 110 150 Q 145 162 178 174', 0.7, 0.85],
  ['M 22 122 Q 56 124 92 132 Q 128 142 168 158', 0.55, 0.75],
  ['M 22 114 Q 58 116 96 124 Q 132 134 172 150', 0.7, 0.9],
  ['M 22 106 Q 58 108 96 116 Q 132 126 172 142', 0.5, 0.7],
  ['M 18 98 Q 56 100 96 108 Q 134 118 178 134', 0.9, 1.15],
  ['M 18 88 Q 56 90 96 98 Q 134 108 178 124', 0.6, 0.8],
  ['M 22 78 Q 60 80 100 88 Q 138 98 178 114', 0.45, 0.7],
  ['M 30 68 Q 70 70 110 78 Q 145 86 178 100', 0.35, 0.65],
  ['M 47 134 L 52 70', 0.4, 0.6],
  ['M 66 132 L 72 68', 0.55, 0.75],
  ['M 78 134 L 86 64', 0.85, 1.05],
  ['M 90 138 L 98 70', 0.55, 0.75],
  ['M 108 142 L 116 78', 0.5, 0.7],
  ['M 130 154 L 136 96', 0.6, 0.8],
  ['M 148 162 L 152 102', 0.4, 0.65],
];

export default function GlobeLoader({ pins, university, skipLabel }) {
  const [phase, setPhase] = useState(null); // null (not playing) | globe | city | pins | gone
  const merRef = useRef(null);
  const timers = useRef([]);
  const rafRef = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!takeLoaderFlag() || reduce) return undefined;
    const t = timers.current;
    const later = (fn, ms) => t.push(setTimeout(fn, ms));
    let spinning = true;

    const ellipses = merRef.current ? [...merRef.current.children] : [];
    const draw = (time) => {
      for (let k = 0; k < ellipses.length; k++) {
        ellipses[k].setAttribute('rx', Math.abs(80 * Math.sin(time + (k * Math.PI) / MERIDIANS)).toFixed(2));
      }
    };
    const spin = (now) => {
      if (!spinning) return;
      draw(now / 1400);
      rafRef.current = requestAnimationFrame(spin);
    };

    document.documentElement.style.overflow = 'hidden';
    draw(0.4);
    rafRef.current = requestAnimationFrame((now) => {
      setPhase('globe');
      spin(now);
    });
    later(() => setPhase('city'), 1900);
    later(() => {
      spinning = false;
    }, 2300);
    later(() => setPhase('pins'), 3300);
    later(() => setPhase('gone'), 4600);

    return () => {
      spinning = false;
      t.forEach(clearTimeout);
      t.length = 0;
      cancelAnimationFrame(rafRef.current);
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Ending: fade out, give the page its scroll back, then unmount the overlay.
  useEffect(() => {
    if (phase !== 'gone') return undefined;
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    cancelAnimationFrame(rafRef.current);
    document.documentElement.style.overflow = '';
    const id = setTimeout(() => setPhase(null), 950);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (!phase || phase === 'gone') return undefined;
    const skip = () => setPhase('gone');
    document.addEventListener('keydown', skip);
    return () => document.removeEventListener('keydown', skip);
  }, [phase]);

  return (
    <div
      className={`intro${phase === 'gone' ? ' gone' : ''}`}
      hidden={phase === null}
      data-phase={phase === 'gone' ? 'pins' : phase || 'globe'}
      role="presentation"
      onClick={() => setPhase('gone')}
    >
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <g className="g-globe">
          <circle cx="100" cy="100" r="80" fill="none" stroke="#fff" strokeWidth="1" />
          <g ref={merRef} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".5">
            {Array.from({ length: MERIDIANS }, (_, k) => (
              <ellipse key={k} cx="100" cy="100" rx="0" ry="80" />
            ))}
          </g>
          <g fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth=".5">
            <ellipse cx="100" cy="100" rx="80" ry="18" />
            <ellipse cx="100" cy="72" rx="74.9" ry="16.8" />
            <ellipse cx="100" cy="128" rx="74.9" ry="16.8" />
            <ellipse cx="100" cy="46" rx="58.4" ry="13.1" />
            <ellipse cx="100" cy="154" rx="58.4" ry="13.1" />
          </g>
          <circle cx="112" cy="80" r="2.2" fill="#fff" />
          <circle cx="112" cy="80" r="5" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth=".6" />
        </g>
        <g className="g-city">
          <g className="tier tier1">
            <path d="M -10 134 Q 30 124 70 138 Q 110 152 150 168 Q 180 180 210 200 L 210 230 L -10 230 Z" fill="#fff" fillOpacity=".07" />
            <path d="M 12 118 L 12 138 L 50 138 L 50 130 L 38 130 L 38 124 L 24 124 L 24 118 Z" fill="#fff" fillOpacity=".05" stroke="#fff" strokeOpacity=".55" strokeWidth=".7" />
            <path d="M -8 124 L 12 124 L 12 138 L 50 138 Q 80 144 110 154 Q 145 167 175 178 Q 195 184 210 192" fill="none" stroke="#fff" strokeWidth="1" />
          </g>
          <g className="tier tier2" fill="none" stroke="#fff" strokeLinecap="round">
            {TIER2.map(([d, o, w]) => (
              <path key={d} d={d} strokeOpacity={o} strokeWidth={w} />
            ))}
            <path d="M 38 64 L 52 58 L 78 54 L 110 54 L 138 58 L 158 66 L 168 78 L 168 92" strokeOpacity=".55" strokeWidth=".8" strokeDasharray="2 1.2" />
            <path d="M 118 88 L 152 88 L 154 110 L 120 112 Z" fill="#fff" fillOpacity=".08" strokeOpacity=".5" strokeWidth=".6" />
          </g>
          <g className="pins" fill="#fff" fontSize="5.2" letterSpacing=".9">
            {pins.map((p) => (
              <g key={p.num}>
                <rect x={p.x} y={p.y} width="5" height="5" />
                <text x={p.labelEnd ? p.x - 3.5 : p.x + 8.5} y={p.y + 4.5} textAnchor={p.labelEnd ? 'end' : undefined}>
                  {p.num}
                </text>
              </g>
            ))}
            <text x="124" y="101" fillOpacity=".6" fontSize="4.4">
              {university}
            </text>
          </g>
        </g>
      </svg>
      <div className="skip">{skipLabel}</div>
    </div>
  );
}
