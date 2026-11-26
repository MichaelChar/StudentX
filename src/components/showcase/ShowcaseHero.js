'use client';

import { useEffect, useRef, useState } from 'react';
import { SX_GLYPHS, GLYPH_HEIGHT } from './glyphs';

/*
  The homepage hero: the StudentX wordmark is a window onto the London
  skyline, and scrolling pushes the camera through it (demo v13, founder's
  pick over v10's lifting black panel).

  - The cut-out is drawn on a <canvas> (Path2D from the wordmark's glyphs),
    not an SVG mask, so it stays crisp at ~150x and light on iPhone Safari.
  - The zoom aims at the middle of the E's centre bar: solid ink, almost dead
    centre, so the last frame is that bar opening like a letterbox. The X
    can't be the target: its chevrons only touch at a point, so zooming there
    ends on black.
  - GSAP ScrollTrigger with `scrub: 1`, so the zoom trails the scroll and
    catches up over about a second ("the studentx word should go … slowly").
    `ignoreMobileResize` stops the iOS address bar re-measuring mid-scroll.
  - Portrait (phones): the photo starts fitted to the screen WIDTH, so the
    small word shows the whole panorama; it grows to fill the screen with the
    word, then pans from the red building to the London Eye. The hero is
    380vh in portrait, 320vh otherwise (showcase.css).
  - Reduced motion, or GSAP failing to load, shows the plain photo (`.static`).

  The maths below is the demo's, line for line; change it there first and
  re-check with zoomcheck.js if it needs changing.
*/

const FX = 3584 + 384; // the E (4th advance, x 3584) at its centre
const FY = 320; // its middle bar's centre line (y-up)

const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export default function ShowcaseHero({ image, alt, label, cue }) {
  const heroRef = useRef(null);
  const pinRef = useRef(null);
  const skyRef = useRef(null);
  const cutRef = useRef(null);
  const cueRef = useRef(null);
  const [mode, setMode] = useState('pending'); // pending | live | static

  useEffect(() => {
    const hero = heroRef.current;
    const pin = pinRef.current;
    const sky = skyRef.current;
    const cut = cutRef.current;
    const cueEl = cueRef.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let cancelled = false;
    let raf = 0;

    if (reduce) {
      raf = requestAnimationFrame(() => setMode('static'));
      return () => cancelAnimationFrame(raf);
    }

    const ctx = cut.getContext('2d');
    const glyphs = SX_GLYPHS.map((g) => ({ path: new Path2D(g.d), x: g.x }));
    const prog = { p: 0 };
    let geo = null;

    function layout(force) {
      const W = pin.clientWidth;
      const H = pin.clientHeight;
      if (!W || !H) return;
      if (!force && geo && geo.W === W && geo.H === H) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cut.width = Math.round(W * dpr);
      cut.height = Math.round(H * dpr);
      const ww = Math.min(W * (W < 700 ? 0.84 : 0.72), 1120);
      const u = ww / 7040;
      const x0 = (W - ww) / 2;
      const y0 = (H - GLYPH_HEIGHT * u) / 2;
      const iw = image.w;
      const ih = image.h;
      const k = Math.max(W / iw, H / ih);
      const portrait = H > W;
      geo = {
        W, H, dpr, u,
        fx: x0 + FX * u, fy: y0 + (GLYPH_HEIGHT - FY) * u, // where the zoom point sits at rest
        smax: Math.max(H / (128 * u), W / (512 * u)) * 1.08, // the E bar (128 tall, solid 256 either side) covers the screen
        iw, ih, kc: k, dw: iw * k, dh: ih * k, portrait,
        zoomEnd: portrait ? 0.62 : 0.8, // the rest of the scroll holds (and on a phone, pans) the photo
      };
      // the photo is laid out once at its full-screen (cover) size; paint() only ever transforms it
      sky.style.width = `${geo.dw}px`;
      sky.style.height = `${geo.dh}px`;
      paint(prog.p);
    }

    function paint(p) {
      if (!geo) return;
      const g = geo;
      const q = clamp(p / g.zoomEnd);
      // ease in: the word grows gently while it is still readable, then the camera punches through the E
      const s = Math.pow(g.smax, Math.pow(q, 2.4));
      const c = 0.5 - Math.cos(Math.PI * q) / 2;
      const ax = g.fx + (g.W / 2 - g.fx) * c; // the zoom point drifts to dead centre
      const ay = g.fy + (g.H / 2 - g.fy) * c;
      if (q < 1) {
        const su = s * g.u * g.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cut.width, cut.height);
        ctx.globalCompositeOperation = 'destination-out';
        for (const gl of glyphs) {
          ctx.setTransform(su, 0, 0, -su, g.dpr * ax + su * (gl.x - FX), g.dpr * ay + su * FY);
          ctx.fill(gl.path);
        }
        cut.style.visibility = '';
      } else cut.style.visibility = 'hidden';
      // The photo only has to cover the letters. While the word is a thin band it is fitted to the
      // screen width, so even a phone sees the whole skyline through the letters. As the word grows
      // the photo grows with it until it fills the screen; on a portrait screen it also pans, red
      // building to London Eye, over the full scroll.
      const band = Math.min(g.H, GLYPH_HEIGHT * g.u * s * 1.25);
      const m = (Math.max(g.W / g.iw, band / g.ih) / g.kc) * (1.08 - 0.08 * c); // with a slight push-in
      const Dw = g.dw * m;
      const Dh = g.dh * m;
      const px = g.portrait ? 0.5 - Math.cos(Math.PI * clamp(p)) / 2 : 0.62;
      sky.style.transform = `matrix(${m.toFixed(4)},0,0,${m.toFixed(4)},${(-(Dw - g.W) * px).toFixed(1)},${((g.H - Dh) / 2).toFixed(1)})`;
      cueEl.style.opacity = String(clamp(1 - q * 8));
    }

    // Paint the resting frame at once, before GSAP arrives, so the first thing
    // on screen is the word and not the whole photo.
    layout(true);
    raf = requestAnimationFrame(() => setMode('live'));

    let tween = null;
    (async () => {
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);
        ScrollTrigger.config({ ignoreMobileResize: true });
        tween = gsap.to(prog, {
          p: 1,
          ease: 'none',
          onUpdate: () => paint(prog.p),
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: () => `+=${Math.max(1, hero.offsetHeight - pin.offsetHeight)}`,
            scrub: 1,
          },
        });
        // Arriving mid-page (back button, restored scroll): land on the current
        // position instead of gliding there from the top.
        ScrollTrigger.refresh();
        const tr = tween.scrollTrigger;
        tr?.getTween?.()?.progress(1);
        if (tr) tween.progress(tr.progress);
        paint(prog.p);
      } catch {
        if (cancelled) return;
        // GSAP failed to load: the plain photo, at plain cover size.
        sky.style.width = sky.style.height = sky.style.transform = '';
        setMode('static');
      }
    })();

    let rz = 0;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(() => layout(false), 120);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(rz);
      window.removeEventListener('resize', onResize);
      if (tween) {
        tween.scrollTrigger?.kill();
        tween.kill();
      }
    };
  }, [image.w, image.h]);

  const isStatic = mode === 'static';
  return (
    <section ref={heroRef} className={`hero${isStatic ? ' static' : ''}${mode === 'live' ? ' ready' : ''}`} aria-label={label}>
      <div ref={pinRef} className="hero-pin">
        {/* A plain <img>: the hero transforms it every frame, and
            images.unoptimized means next/image would add nothing but markup. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={skyRef}
          className="sky"
          src={image.src}
          width={image.w}
          height={image.h}
          alt={alt}
          fetchPriority="high"
          decoding="async"
        />
        <canvas ref={cutRef} className="cut" aria-hidden="true" style={isStatic ? { display: 'none' } : undefined} />
        <div ref={cueRef} className="cue" style={isStatic ? { display: 'none' } : undefined}>
          {cue}
        </div>
      </div>
    </section>
  );
}
