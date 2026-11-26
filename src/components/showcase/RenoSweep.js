'use client';

import { useEffect, useRef, useState } from 'react';

/*
  The homepage's second scene: a renovation, before and after, full screen.
  Pinned right after the hero; as you scroll the "after" slides in from the
  right over the "before" (a clip wipe with a white edge), locked to the same
  frame. Demo v14-v20.

  Founder's calls: full screen with no title under it (v15), and no
  BEFORE/AFTER tags (v20) — just the two photos and the white edge. The alt
  text still says which is which.

  It only reads as before/after when both photos show the same view. His
  kitchen pair was not shot from quite the same spot, so kitchen/make_pair.py
  (in the demo folder) bakes the alignment into the files; both are cropped
  around the same focus here, so they stay lined up at every screen shape.
  FOCUS sits a little above and right of centre, so a wide screen keeps the
  ceiling line and back corner and a phone keeps a strip of the right wall.
*/
const FOCUS = [0.55, 0.4];
const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Cover the frame, cropped around FOCUS (like object-position). */
function place(img, size, W, H) {
  const k = Math.max(W / size.w, H / size.h);
  const w = size.w * k;
  const h = size.h * k;
  const l = Math.min(0, Math.max(W - w, FOCUS[0] * W - FOCUS[0] * w));
  const t = Math.min(0, Math.max(H - h, FOCUS[1] * H - FOCUS[1] * h));
  Object.assign(img.style, { width: `${w}px`, height: `${h}px`, left: `${l}px`, top: `${t}px` });
}

export default function RenoSweep({ before, after, label, beforeAlt, afterAlt }) {
  const rootRef = useRef(null);
  const pinRef = useRef(null);
  const frameRef = useRef(null);
  const afterRef = useRef(null);
  const edgeRef = useRef(null);
  const bRef = useRef(null);
  const aRef = useRef(null);
  const [isStatic, setStatic] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    const pin = pinRef.current;
    const frame = frameRef.current;
    const afterEl = afterRef.current;
    const edge = edgeRef.current;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const prog = { p: 0 };
    let width = 0;
    let cancelled = false;
    let raf = 0;
    let tween = null;

    function paint(p) {
      // hold the before for the first stretch and the after for the last, sweep in between
      const w = clamp((p - 0.15) / 0.7);
      const e = 0.5 - Math.cos(Math.PI * w) / 2;
      const x = 1 - e;
      afterEl.style.clipPath = `inset(0 0 0 ${(x * 100).toFixed(2)}%)`;
      edge.style.transform = `translate3d(${(x * width).toFixed(1)}px,0,0)`;
      edge.style.opacity = e > 0.001 && e < 0.999 ? '1' : '0';
    }
    function layout() {
      const W = frame.clientWidth;
      const H = frame.clientHeight;
      if (!W || !H) return;
      place(bRef.current, before, W, H);
      place(aRef.current, after, W, H);
      width = W;
      paint(prog.p);
    }

    if (reduce) prog.p = 0.5; // no motion: a still half-and-half split
    layout();

    if (reduce) {
      raf = requestAnimationFrame(() => setStatic(true));
    } else {
      (async () => {
        try {
          const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
          if (cancelled) return;
          gsap.registerPlugin(ScrollTrigger);
          tween = gsap.to(prog, {
            p: 1,
            ease: 'none',
            onUpdate: () => paint(prog.p),
            scrollTrigger: {
              trigger: root,
              start: 'top top',
              end: () => `+=${Math.max(1, root.offsetHeight - pin.offsetHeight)}`,
              scrub: 1,
            },
          });
          ScrollTrigger.refresh();
          const tr = tween.scrollTrigger;
          tr?.getTween?.()?.progress(1);
          if (tr) tween.progress(tr.progress);
          paint(prog.p);
        } catch {
          if (cancelled) return;
          prog.p = 0.5;
          paint(prog.p);
          setStatic(true);
        }
      })();
    }

    let rz = 0;
    const onResize = () => {
      clearTimeout(rz);
      rz = setTimeout(layout, 120);
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
  }, [before, after]);

  /* eslint-disable @next/next/no-img-element -- sized and placed by layout() every resize */
  return (
    <section ref={rootRef} className={`reno-scroll${isStatic ? ' static' : ''}`} aria-label={label}>
      <div ref={pinRef} className="rs-pin">
        <figure ref={frameRef} className="rs-frame">
          <div className="rs-img">
            <img ref={bRef} src={before.src} width={before.w} height={before.h} alt={beforeAlt} decoding="async" />
          </div>
          <div ref={afterRef} className="rs-after">
            <div className="rs-img">
              <img ref={aRef} src={after.src} width={after.w} height={after.h} alt={afterAlt} decoding="async" />
            </div>
          </div>
          <span ref={edgeRef} className="rs-edge" aria-hidden="true" />
        </figure>
      </div>
    </section>
  );
  /* eslint-enable @next/next/no-img-element */
}
