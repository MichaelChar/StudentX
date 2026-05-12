'use client';

import { useEffect, useRef } from 'react';
import {
  geoOrthographic,
  geoPath,
  geoGraticule10,
} from 'd3-geo';
import * as topojson from 'topojson-client';
import CITY_GLOBE_CONFIG from './city-globe-data';

const W = 200;
const H = 200;
const R = 92;

export default function CityGlobeLoader({ city, onComplete }) {
  const stageRef = useRef(null);
  const layerGlobeRef = useRef(null);
  const layerCityRef = useRef(null);
  const graticuleRef = useRef(null);
  const countriesRef = useRef(null);
  const cityZoomRef = useRef(null);
  const cityTier1Ref = useRef(null);
  const cityTier2Ref = useRef(null);
  const cityTier3Ref = useRef(null);
  const cityPulseRef = useRef(null);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cfg = CITY_GLOBE_CONFIG[city];

  useEffect(() => {
    if (!cfg) {
      if (onCompleteRef.current) onCompleteRef.current();
      return;
    }

    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq.matches) {
        const id = setTimeout(() => onCompleteRef.current && onCompleteRef.current(), 200);
        return () => clearTimeout(id);
      }
    }

    let cancelled = false;
    const cleanups = [];

    (async () => {
      let world;
      let countriesHi = null;
      try {
        world = await fetch('/topojson/countries-110m.json').then((r) => r.json());
      } catch (err) {
        console.error('CityGlobeLoader: failed to load 110m topology', err);
        if (!cancelled && onCompleteRef.current) onCompleteRef.current();
        return;
      }
      if (cancelled) return;

      const countries = topojson.feature(world, world.objects.countries);
      countriesHi = countries;
      fetch('/topojson/countries-50m.json')
        .then((r) => r.json())
        .then((wHi) => {
          if (cancelled || !wHi) return;
          countriesHi = topojson.feature(wHi, wHi.objects.countries);
        })
        .catch(() => {});

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
        if (opts.gratOpacity !== undefined) {
          gGrat.setAttribute('opacity', opts.gratOpacity.toFixed(3));
        } else {
          gGrat.setAttribute('opacity', '1');
        }
        const set = opts.useHi ? countriesHi.features : countries.features;
        let s = '';
        for (const f of set) {
          const d = path(f);
          if (d) s += '<path d="' + d + '"/>';
        }
        gCountries.innerHTML = s;
      }

      // Phase 1 — spinning globe
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
          const targetRaw = 345;
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

      // Phase 2 — ortho zoom (variant-dependent easing)
      function animateOrthoZoom() {
        return new Promise((resolve) => {
          const o = cfg.ortho;
          const t0 = performance.now();
          const startLambda = -15;
          const startPhi = -15;
          const startScale = R;

          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / o.dur);

            let lam, phi, scl;
            if (cfg.variant === 'B') {
              const ePan = 1 - Math.pow(1 - t, o.ePanExp);
              const eScale = Math.pow(t, o.eScaleExp);
              lam = startLambda + (o.endLambda - startLambda) * ePan;
              phi = startPhi + (o.endPhi - startPhi) * ePan;
              scl = startScale * Math.pow(o.endScale / startScale, eScale);
            } else {
              const e = 1 - Math.pow(1 - t, 3);
              lam = startLambda + (o.endLambda - startLambda) * e;
              phi = startPhi + (o.endPhi - startPhi) * e;
              scl = startScale * Math.pow(o.endScale / startScale, e);
            }

            const drawGrat = cfg.variant === 'B' ? true : t < 0.4;
            const gratOp = cfg.variant === 'B'
              ? Math.max(0, 1 - t / o.gratFade)
              : undefined;

            renderGlobe(lam, {
              rotate: [lam, phi, 0],
              scale: scl,
              useHi: t > o.hiAt,
              drawGraticule: drawGrat,
              gratOpacity: gratOp,
            });

            if (t < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      // Phase 3A — continuous reveal (Variant A: Larissa)
      function animateCityReveal() {
        return new Promise((resolve) => {
          const cr = cfg.cityReveal;
          const tiers = [
            { el: cityTier1Ref.current, s: cr.tier1.s, e: cr.tier1.e },
            { el: cityTier2Ref.current, s: cr.tier2.s, e: cr.tier2.e },
            { el: cityTier3Ref.current, s: cr.tier3.s, e: cr.tier3.e },
          ];
          const t0 = performance.now();
          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / cr.dur);
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

      // Phase 3B — city zoom-in (Variant B)
      function animateCityZoomIn() {
        return new Promise((resolve) => {
          const cz = cfg.cityZoomIn;
          const cityZoom = cityZoomRef.current;
          const t1 = cityTier1Ref.current;
          const layerGlobe = layerGlobeRef.current;
          const cx = 100, cy = 100;
          const t0 = performance.now();
          const o = cfg.ortho;

          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / cz.dur);
            const e = 1 - Math.pow(1 - t, cz.easeExp);

            const s = cz.startScale + (1.0 - cz.startScale) * e;
            const tx = cx - cx * s + (cz.offsetX || 0) * s;
            const ty = cy - cy * s;
            if (cityZoom) {
              cityZoom.setAttribute('transform', `translate(${tx} ${ty}) scale(${s})`);
            }

            if (cz.orthoStart && cz.orthoEnd) {
              const oScale = cz.orthoStart * Math.pow(cz.orthoEnd / cz.orthoStart, e);
              renderGlobe(o.endLambda, {
                rotate: [o.endLambda, o.endPhi, 0],
                scale: oScale,
                useHi: true,
                drawGraticule: false,
              });
            }

            if (t1) {
              const fadeT = Math.max(0, Math.min(1, (t - (cz.tier1FadeStart || 0)) / cz.tier1FadeDenom));
              t1.setAttribute('opacity', (1 - Math.pow(1 - fadeT, 3)).toFixed(3));
            }

            if (layerGlobe) {
              if (cz.keepGlobe) {
                layerGlobe.style.opacity = '1';
              } else if (cz.globeFadeStart != null) {
                const gFade = t < cz.globeFadeStart
                  ? 0
                  : Math.pow((t - cz.globeFadeStart) / (cz.globeFadeEnd - cz.globeFadeStart), cz.globeFadeExp);
                layerGlobe.style.opacity = (1 - gFade).toFixed(3);
              }
            }

            if (t < 1) requestAnimationFrame(step);
            else resolve();
          }
          requestAnimationFrame(step);
        });
      }

      // Phase 3B cont. — city outline (tiers 2+3)
      function animateCityOutline() {
        return new Promise((resolve) => {
          const co = cfg.cityOutline;
          const tiers = [
            { el: cityTier2Ref.current, s: co.tier2.s, e: co.tier2.e },
            { el: cityTier3Ref.current, s: co.tier3.s, e: co.tier3.e },
          ];
          const t0 = performance.now();
          function step(now) {
            if (cancelled) return resolve();
            const t = Math.min(1, (now - t0) / co.dur);
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

      // Run the timeline
      const stage = stageRef.current;
      const layerGlobe = layerGlobeRef.current;
      try {
        await new Promise((r) => setTimeout(r, 1500));
        if (cancelled) return;
        await settleOnEurope();
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, 280));
        if (cancelled) return;

        if (stage) stage.dataset.phase = 'greece';
        if (cityTier1Ref.current) cityTier1Ref.current.setAttribute('opacity', '0');
        if (cityTier2Ref.current) cityTier2Ref.current.setAttribute('opacity', '0');
        if (cityTier3Ref.current) cityTier3Ref.current.setAttribute('opacity', '0');

        if (cfg.variant === 'A') {
          if (cityZoomRef.current) {
            cityZoomRef.current.setAttribute('transform', 'translate(0 0) scale(1)');
          }

          const zoomPromise = animateOrthoZoom();
          const revealTimer = setTimeout(() => {
            if (cancelled) return;
            if (stage) stage.dataset.phase = 'city';
            if (layerCityRef.current) layerCityRef.current.classList.add('active');
            animateCityReveal();
          }, 1400);
          cleanups.push(() => clearTimeout(revealTimer));
          await zoomPromise;
          if (cancelled) return;
          await animateCityPulse(1100);
        } else {
          const cz = cfg.cityZoomIn;
          if (cityZoomRef.current) {
            const s0 = cz.startScale;
            const cx = 100, cy = 100;
            const tx = cx - cx * s0 + (cz.offsetX || 0) * s0;
            const ty = cy - cy * s0;
            cityZoomRef.current.setAttribute('transform', `translate(${tx} ${ty}) scale(${s0})`);
          }

          await animateOrthoZoom();
          if (cancelled) return;

          if (stage) stage.dataset.phase = 'city';
          if (layerCityRef.current) layerCityRef.current.classList.add('active');

          await animateCityZoomIn();
          if (cancelled) return;

          if (layerGlobe && !cz.keepGlobe) {
            layerGlobe.style.opacity = '';
            layerGlobe.classList.remove('active');
          }

          await animateCityOutline();
          if (cancelled) return;
          await animateCityPulse(1100);
        }

        if (cancelled) return;
      } catch (err) {
        console.error('CityGlobeLoader animation failed:', err);
      }

      if (!cancelled && onCompleteRef.current) onCompleteRef.current();
    })();

    return () => {
      cancelled = true;
      for (const fn of cleanups) {
        try { fn(); } catch { /* noop */ }
      }
    };
  }, [cfg]);

  if (!cfg) return null;

  const { ink, bg } = cfg;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: bg }}
      role="status"
      aria-live="polite"
      aria-label="Loading city"
    >
      <div ref={stageRef} className="cgl-stage" data-phase="globe">
        <style>{`
          .cgl-stage {
            width: 200px;
            height: 200px;
            position: relative;
          }
          .cgl-stage .layer {
            position: absolute;
            inset: 0;
            opacity: 0;
            transition: opacity 600ms ease;
          }
          .cgl-stage .layer.active { opacity: 1; }
          .cgl-stage svg {
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
              <clipPath id="cgl-globe-clip">
                <circle cx="100" cy="100" r="92" />
              </clipPath>
            </defs>
            <circle cx="100" cy="100" r="92" fill="none" stroke={ink} strokeWidth="1.25" />
            <g clipPath="url(#cgl-globe-clip)">
              <g
                ref={graticuleRef}
                stroke={ink}
                strokeOpacity="0.18"
                fill="none"
                strokeWidth="0.5"
              />
              <g
                ref={countriesRef}
                stroke={ink}
                strokeWidth="0.7"
                strokeLinejoin="round"
                strokeLinecap="round"
                fill="none"
              />
            </g>
          </svg>
        </div>

        {/* City map */}
        <div ref={layerCityRef} className="layer">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <defs>
              <clipPath id="cgl-city-clip">
                <circle cx="100" cy="100" r="92" />
              </clipPath>
            </defs>
            <g clipPath="url(#cgl-city-clip)">
              <g ref={cityZoomRef} transform="translate(0 0) scale(1)">
                <g ref={cityTier1Ref} opacity="0">
                  {cfg.tier1(ink, bg)}
                </g>
                <g ref={cityTier2Ref} opacity="0">
                  {cfg.tier2(ink)}
                </g>
                <g ref={cityTier3Ref} opacity="0">
                  {cfg.tier3(ink, cityPulseRef)}
                </g>
              </g>
            </g>
            <circle cx="100" cy="100" r="92" fill="none" stroke={ink} strokeWidth="1.25" />
          </svg>
        </div>
      </div>
    </div>
  );
}
