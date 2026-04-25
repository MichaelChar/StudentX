'use client';

import { useEffect, useRef, useState } from 'react';
import {
  geoOrthographic,
  geoMercator,
  geoPath,
  geoGraticule10,
} from 'd3-geo';
import * as topojson from 'topojson-client';

/*
  GlobeLoader — three-phase quiz→results transition animation.

  Phase 1 (~3s): monochrome globe spins, country outlines (d3 orthographic
                 + world-atlas 110m TopoJSON), eases to a stop centered on Europe.
  Phase 2 (~2.6s): same orthographic projection zooms continuously into
                   Thessaloniki, swapping to the 50m hi-detail TopoJSON
                   partway through. No projection swap, no crossfade.
  Phase 3 (~1.6s reveal + ~1s hold): Thessaloniki city map fades up over the
                                     still-zooming ortho in three tiers
                                     (water/coast → streets → landmarks +
                                     AUSoM pulse).

  Total runtime: ~8s. Calls onComplete after the final pulse settles.
  The component is self-contained (no global side effects) and tears down
  cleanly on unmount.

  Design source: claude.ai/design — see the chat transcripts in the
  handoff bundle for the full iteration history that landed on this design.
*/
const W = 200;
const H = 200;
const R = 92;

export default function GlobeLoader({ onComplete }) {
  const stageRef = useRef(null);
  const layerGlobeRef = useRef(null);
  const layerCityRef = useRef(null);
  const graticuleRef = useRef(null);
  const countriesRef = useRef(null);
  const cityTier1Ref = useRef(null);
  const cityTier2Ref = useRef(null);
  const cityTier3Ref = useRef(null);
  const cityPulseRef = useRef(null);

  // Stash onComplete in a ref so a new identity each render doesn't restart
  // the animation effect (the parent typically passes an inline arrow).
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Reduce-motion: skip the animation entirely, fire onComplete immediately.
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) {
        setReduced(true);
        const id = setTimeout(() => onCompleteRef.current && onCompleteRef.current(), 200);
        return () => clearTimeout(id);
      }
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (reduced) return undefined;
    let cancelled = false;
    const cleanups = [];

    (async () => {
      // Load topology — 110m for the spinning globe (small/fast),
      // 50m for the Greece zoom (more coastal detail).
      let world, worldHi;
      try {
        const [w, wHi] = await Promise.all([
          fetch('/topojson/countries-110m.json').then((r) => r.json()),
          fetch('/topojson/countries-50m.json').then((r) => r.json()).catch(() => null),
        ]);
        world = w;
        worldHi = wHi;
      } catch (err) {
        console.error('GlobeLoader: failed to load topology', err);
        // Fail safe: skip the animation, signal complete so the page proceeds.
        if (!cancelled && onCompleteRef.current) onCompleteRef.current();
        return;
      }
      if (cancelled) return;

      const countries = topojson.feature(world, world.objects.countries);
      const countriesHi = worldHi
        ? topojson.feature(worldHi, worldHi.objects.countries)
        : countries;

      const proj = geoOrthographic()
        .scale(R)
        .translate([W / 2, H / 2])
        .clipAngle(90)
        .rotate([0, -15, 0]);
      const path = geoPath(proj);
      const graticule = geoGraticule10();

      const gGrat = graticuleRef.current;
      const gCountries = countriesRef.current;
      if (!gGrat || !gCountries) return;

      function renderGlobe(lambda, opts) {
        opts = opts || {};
        const rot = opts.rotate || [lambda, -15, 0];
        const scale = opts.scale || R;
        proj.rotate(rot).scale(scale);
        if (opts.drawGraticule !== false) {
          const d = path(graticule) || '';
          gGrat.innerHTML = '<path d="' + d + '"/>';
        } else {
          gGrat.innerHTML = '';
        }
        const set = opts.useHi ? countriesHi.features : countries.features;
        let s = '';
        for (const f of set) {
          const d = path(f);
          if (d) s += '<path d="' + d + '"/>';
        }
        gCountries.innerHTML = s;
      }

      // Phase 1 — spinning globe. Runs until settleOnEurope is awaited.
      let lambda = 0;
      let spinning = true;
      let last = performance.now();
      let rafId = 0;
      function tick(now) {
        if (cancelled) return;
        const dt = now - last;
        last = now;
        if (spinning) {
          lambda = (lambda + dt * 0.04) % 360;
          renderGlobe(lambda);
        }
        rafId = requestAnimationFrame(tick);
      }
      renderGlobe(0);
      rafId = requestAnimationFrame(tick);
      cleanups.push(() => cancelAnimationFrame(rafId));

      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      function settleOnEurope() {
        return new Promise((resolve) => {
          spinning = false;
          const t0 = performance.now();
          const dur = 1200;
          const start = ((lambda % 360) + 360) % 360;
          const targetRaw = 345; // λ = -15 → centers Europe
          let delta = targetRaw - start;
          if (delta < 0) delta += 360;
          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / dur);
            const e = easeInOut(t);
            lambda = (start + delta * e) % 360;
            renderGlobe(lambda);
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      // Phase 2 — continuous orthographic zoom Europe → Thessaloniki on the
      // SAME globe layer. No projection swap.
      function animateOrthoZoom() {
        return new Promise((resolve) => {
          const t0 = performance.now();
          const dur = 2600;
          const startLambda = -15;
          const startPhi = -15;
          const startScale = R;
          const endLambda = -22.9444;
          const endPhi = -40.6401;
          const endScale = 5200;
          const HI_AT = 0.12;
          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / dur);
            const e = 1 - Math.pow(1 - t, 3); // ease-out cubic — slow tail
            const lam = startLambda + (endLambda - startLambda) * e;
            const phi = startPhi + (endPhi - startPhi) * e;
            const scl = startScale * Math.pow(endScale / startScale, e);
            renderGlobe(lam, {
              rotate: [lam, phi, 0],
              scale: scl,
              useHi: t > HI_AT,
              drawGraticule: t < 0.4,
            });
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      // Phase 3 — staggered tier reveal of the Thessaloniki city map over the
      // still-zooming ortho. Tiers: water → streets → landmarks + AUSoM.
      function animateCityReveal() {
        return new Promise((resolve) => {
          const tiers = [
            { el: cityTier1Ref.current, s: 0.0, e: 0.45 },
            { el: cityTier2Ref.current, s: 0.2, e: 0.8 },
            { el: cityTier3Ref.current, s: 0.55, e: 1.0 },
          ];
          const t0 = performance.now();
          const dur = 1600;
          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / dur);
            for (const tier of tiers) {
              if (!tier.el) continue;
              const local = Math.max(0, Math.min(1, (t - tier.s) / (tier.e - tier.s)));
              const o = 1 - Math.pow(1 - local, 3);
              tier.el.setAttribute('opacity', o.toFixed(3));
            }
            if (t < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      function animateCityPulse(durationMs) {
        return new Promise((resolve) => {
          const t0 = performance.now();
          function step(now) {
            if (cancelled) return resolve();
            const elapsed = now - t0;
            const pulse = cityPulseRef.current;
            if (pulse) {
              const cyc = (elapsed / 1200) % 1;
              const r = 3 + cyc * 12;
              const op = 0.75 * (1 - cyc);
              pulse.setAttribute('r', r.toFixed(2));
              pulse.setAttribute('stroke-opacity', op.toFixed(2));
            }
            if (elapsed < durationMs) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      // Run the timeline.
      const stage = stageRef.current;
      try {
        // Hold spin briefly, then settle.
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        await settleOnEurope();
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 280));
        if (cancelled) return;

        if (stage) stage.dataset.phase = 'greece';
        // Reset tier opacities (defensive — useEffect runs once but be safe).
        if (cityTier1Ref.current) cityTier1Ref.current.setAttribute('opacity', '0');
        if (cityTier2Ref.current) cityTier2Ref.current.setAttribute('opacity', '0');
        if (cityTier3Ref.current) cityTier3Ref.current.setAttribute('opacity', '0');

        const zoomPromise = animateOrthoZoom();

        // Reveal the city tiers AS the ortho is still zooming, ~54% in.
        const revealTimer = setTimeout(() => {
          if (cancelled) return;
          if (stage) stage.dataset.phase = 'city';
          if (layerCityRef.current) layerCityRef.current.classList.add('active');
          animateCityReveal();
        }, 1400);
        cleanups.push(() => clearTimeout(revealTimer));

        await zoomPromise;
        if (cancelled) return;
        // Hold on the AUSoM pulse for a moment, then complete.
        await animateCityPulse(1100);
        if (cancelled) return;
      } catch (err) {
        console.error('GlobeLoader animation failed:', err);
      }

      if (!cancelled && onCompleteRef.current) onCompleteRef.current();
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanups) {
        try { fn(); } catch { /* noop */ }
      }
    };
  }, [reduced]);

  if (reduced) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: '#f1ede4' }}
      role="status"
      aria-live="polite"
      aria-label="Loading your matches"
    >
      <div ref={stageRef} className="globe-stage" data-phase="globe">
        <style>{`
          .globe-stage {
            width: 200px;
            height: 200px;
            position: relative;
          }
          .globe-stage .layer {
            position: absolute;
            inset: 0;
            opacity: 0;
            transition: opacity 600ms ease;
          }
          .globe-stage .layer.active { opacity: 1; }
          .globe-stage svg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: visible;
          }
        `}</style>

        {/* Globe (orthographic, spinning) */}
        <div ref={layerGlobeRef} className="layer active">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <clipPath id="gl-globe-clip">
                <circle cx="100" cy="100" r="92" />
              </clipPath>
            </defs>
            <circle cx="100" cy="100" r="92" fill="none" stroke="#1a1a1a" strokeWidth="1.25" />
            <g clipPath="url(#gl-globe-clip)">
              <g
                ref={graticuleRef}
                stroke="#1a1a1a"
                strokeOpacity="0.18"
                fill="none"
                strokeWidth="0.5"
              />
              <g
                ref={countriesRef}
                stroke="#1a1a1a"
                strokeWidth="0.7"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </svg>
        </div>

        {/* Thessaloniki city map */}
        <div ref={layerCityRef} className="layer">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <clipPath id="gl-city-clip">
                <circle cx="100" cy="100" r="92" />
              </clipPath>
            </defs>
            <g clipPath="url(#gl-city-clip)">
              <g transform="translate(0 0) scale(1)">
                {/* Tier 1: water + coastline */}
                <g ref={cityTier1Ref} opacity="0">
                  <path
                    d="M -10 134 Q 30 124 70 138 Q 110 152 150 168 Q 180 180 210 200 L 210 230 L -10 230 Z"
                    fill="#1a1a1a"
                    fillOpacity="0.06"
                    stroke="none"
                  />
                  <path
                    d="M 12 118 L 12 138 L 50 138 L 50 130 L 38 130 L 38 124 L 24 124 L 24 118 Z"
                    fill="#1a1a1a"
                    fillOpacity="0.05"
                    stroke="#1a1a1a"
                    strokeOpacity="0.55"
                    strokeWidth="0.7"
                  />
                  <path
                    d="M -8 124 L 12 124 L 12 138 L 50 138 Q 80 144 110 154 Q 145 167 175 178 Q 195 184 210 192"
                    fill="none"
                    stroke="#1a1a1a"
                    strokeWidth="1"
                  />
                </g>

                {/* Tier 2: street network */}
                <g ref={cityTier2Ref} opacity="0">
                  <g stroke="#1a1a1a" fill="none" strokeLinecap="round">
                    <path d="M 50 134 Q 80 140 110 150 Q 145 162 178 174" strokeOpacity="0.7" strokeWidth="0.85" />
                    <path d="M 22 122 Q 56 124 92 132 Q 128 142 168 158" strokeOpacity="0.55" strokeWidth="0.75" />
                    <path d="M 22 114 Q 58 116 96 124 Q 132 134 172 150" strokeOpacity="0.7" strokeWidth="0.9" />
                    <path d="M 22 106 Q 58 108 96 116 Q 132 126 172 142" strokeOpacity="0.5" strokeWidth="0.7" />
                    <path d="M 18 98 Q 56 100 96 108 Q 134 118 178 134" strokeOpacity="0.9" strokeWidth="1.15" />
                    <path d="M 18 88 Q 56 90 96 98 Q 134 108 178 124" strokeOpacity="0.6" strokeWidth="0.8" />
                    <path d="M 22 78 Q 60 80 100 88 Q 138 98 178 114" strokeOpacity="0.45" strokeWidth="0.7" />
                    <path d="M 30 68 Q 70 70 110 78 Q 145 86 178 100" strokeOpacity="0.35" strokeWidth="0.65" />
                  </g>
                  <g stroke="#1a1a1a" fill="none" strokeLinecap="round">
                    <path d="M 47 134 L 52 70" strokeOpacity="0.4" strokeWidth="0.6" />
                    <path d="M 66 132 L 72 68" strokeOpacity="0.55" strokeWidth="0.75" />
                    <path d="M 78 134 L 86 64" strokeOpacity="0.85" strokeWidth="1.05" />
                    <path d="M 90 138 L 98 70" strokeOpacity="0.55" strokeWidth="0.75" />
                    <path d="M 108 142 L 116 78" strokeOpacity="0.5" strokeWidth="0.7" />
                    <path d="M 130 154 L 136 96" strokeOpacity="0.6" strokeWidth="0.8" />
                    <path d="M 148 162 L 152 102" strokeOpacity="0.4" strokeWidth="0.65" />
                  </g>
                  <path
                    d="M 14 102 L 50 100 L 80 100"
                    stroke="#1a1a1a"
                    strokeOpacity="0.5"
                    strokeWidth="0.75"
                    fill="none"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 38 64 L 52 58 L 78 54 L 110 54 L 138 58 L 158 66 L 168 78 L 168 92"
                    stroke="#1a1a1a"
                    strokeOpacity="0.55"
                    strokeWidth="0.8"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="2 1.2"
                  />
                  <path
                    d="M 118 88 L 152 88 L 154 110 L 120 112 Z"
                    fill="#1a1a1a"
                    fillOpacity="0.08"
                    stroke="#1a1a1a"
                    strokeOpacity="0.5"
                    strokeWidth="0.6"
                  />
                </g>

                {/* Tier 3: landmark glyphs + AUSoM marker */}
                <g ref={cityTier3Ref} opacity="0">
                  <circle cx="82" cy="130" r="1.4" fill="#1a1a1a" />
                  <circle cx="135" cy="148" r="1.6" fill="#1a1a1a" />
                  <circle cx="135" cy="148" r="3.2" fill="none" stroke="#1a1a1a" strokeOpacity="0.55" strokeWidth="0.5" />
                  <rect x="113" y="106.5" width="3" height="3" fill="#1a1a1a" fillOpacity="0.8" />
                  <circle cx="118" cy="96" r="1.6" fill="none" stroke="#1a1a1a" strokeWidth="0.8" />
                  <circle cx="118" cy="96" r="0.6" fill="#1a1a1a" />
                  <g>
                    <circle ref={cityPulseRef} cx="132" cy="100" r="3.2" fill="none" stroke="#1a1a1a" strokeWidth="1" />
                    <circle cx="132" cy="100" r="2.5" fill="#1a1a1a" />
                    <path d="M 134 98 L 148 76" stroke="#1a1a1a" strokeWidth="0.8" fill="none" />
                    <text
                      x="150"
                      y="74"
                      fontFamily="-apple-system, BlinkMacSystemFont, Inter, sans-serif"
                      fontSize="9"
                      fontWeight="600"
                      fill="#1a1a1a"
                      letterSpacing="0.5"
                    >
                      AUSoM
                    </text>
                  </g>
                </g>
              </g>
            </g>
            <circle cx="100" cy="100" r="92" fill="none" stroke="#1a1a1a" strokeWidth="1.25" />
          </svg>
        </div>
      </div>
    </div>
  );
}
