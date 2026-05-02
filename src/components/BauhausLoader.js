'use client';

import { useEffect, useState } from 'react';

/*
  BauhausLoader — shared centred loading state for blocking spinners
  across landlord + student flows. Designed in claude.ai/design as the
  "Landlord Upload Loaders" V4 (Bauhaus geometry). Used everywhere the
  user is blocked waiting on something — except after the student quiz,
  where GlobeLoader still runs.

  Geometry (200×200 box):
   - navy square inset 30 (rotates over dur*2)
   - gold circle 32×32 orbiting around the square (dur)
   - white diamond pulsing in the centre (dur)

  Reduced-motion: keyframes are disabled in globals.css via the
  prefers-reduced-motion media query; the status cycle keeps ticking so
  the user still sees progress copy.
*/

function useStatusCycle(statuses, intervalMs, speed) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!statuses || statuses.length <= 1) return undefined;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % statuses.length),
      intervalMs / speed
    );
    return () => clearInterval(id);
  }, [statuses, intervalMs, speed]);
  return statuses && statuses.length > 0 ? statuses[idx % statuses.length] : '';
}

function AnimatedDots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x % 3) + 1), 400);
    return () => clearInterval(id);
  }, []);
  return <span aria-hidden="true">{'.'.repeat(n)}</span>;
}

export default function BauhausLoader({
  eyebrow = 'Loading',
  statuses = ['Loading'],
  intervalMs = 1600,
  speed = 1,
  mode = 'block',
  dim = false,
  ariaLabel,
}) {
  const status = useStatusCycle(statuses, intervalMs, speed);
  const dur = 2.4 / speed;
  const cycling = statuses && statuses.length > 1;

  const wrapperClass =
    mode === 'overlay'
      ? 'fixed inset-0 z-[100] flex items-center justify-center bg-stone/95 backdrop-blur-sm'
      : 'flex flex-col items-center justify-center py-12';

  return (
    <div
      className={wrapperClass}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel || eyebrow}
    >
      <div className="flex flex-col items-center justify-center">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold">
          {eyebrow}
        </span>

        <div
          className="relative mt-9"
          style={{ width: 200, height: 200 }}
          aria-hidden="true"
        >
          {/* Navy square — rotates slowly */}
          <div
            className="bauhaus-rotate absolute bg-night"
            style={{
              inset: 30,
              animation: `bauhausRotate ${dur * 2}s linear infinite`,
            }}
          />
          {/* Gold circle — orbits the square */}
          <div
            className="bauhaus-orbit absolute rounded-full bg-gold"
            style={{
              top: 0,
              left: '50%',
              marginLeft: -16,
              width: 32,
              height: 32,
              transformOrigin: '16px 116px',
              animation: `bauhausOrbit ${dur}s cubic-bezier(0.4,0,0.2,1) infinite`,
            }}
          />
          {/* White diamond — pulses dead centre */}
          <div
            className="bauhaus-pulse absolute bg-white"
            style={{
              top: '50%',
              left: '50%',
              width: 12,
              height: 12,
              transform: 'translate(-50%, -50%) rotate(45deg)',
              animation: `bauhausPulse ${dur}s ease-in-out infinite`,
            }}
          />
        </div>

        <div
          className={`mt-9 min-h-[22px] text-center text-sm ${
            dim ? 'text-gray-dark/60' : 'text-gray-dark'
          }`}
        >
          {status}
          {cycling && <AnimatedDots />}
        </div>
      </div>
    </div>
  );
}
