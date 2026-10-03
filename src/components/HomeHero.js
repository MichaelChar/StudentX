'use client';

import Image from 'next/image';
import { motion, useScroll, useTransform } from 'motion/react';
import Icon from './ui/Icon';

// Homepage hero — "illustration behind" (founder's pick, 2026-10-03, option 1+
// of the homepage mockups). At rest it is a short static hero: the StudentX
// wordmark over the container illustration, ~60% of the screen on desktop and
// 46% on a phone, so the search bar and listings start on the first screen.
// It replaced a 200vh scroll-pinned track that held the illustration for two
// screen heights before anything else appeared.
//
// The illustration is a FIXED layer rather than part of the section: as the
// page scrolls it drifts up at 0.3x the scroll speed and fades to a 14% floor
// (a deliberate watermark), and the content below (z-[1] in page.js) slides up
// over it. The wordmark and cue scroll away with the page normally.
//
// Reduced motion is split in CSS (`motion-reduce:`), NOT with useReducedMotion:
// that hook is false on the server and true on such a visitor's first client
// render, so branching the JSX on it is a hydration mismatch and React throws
// the server HTML away. One tree renders everywhere; for those visitors the
// fixed layer is hidden and an in-section copy of the illustration shows.
//
// The image is object-contain on white: the artwork's own canvas is white, so
// the letterboxing is invisible and the whole drawing shows at every size.
// The wordmark keeps its 62vw / max-w-4xl sizing, which matches the branded
// og-default.png link preview, and is the page's h1 (alt "StudentX").
//
// The fixed layer sits where the hero section sits at rest: below the 56px
// mobile header (which scrolls away; `--header-h` is 0 below md) and below the
// 72px sticky desktop header (`--header-h`).
const HERO_H = 'h-[46vh] md:h-[min(60vh,520px)]';

const fade = (y) => {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight;
  return Math.max(0.14, 1 - (y / (vh * 0.8)) * 0.86);
};

function Illustration({ priority = false }) {
  return (
    <Image
      src="/home-hero.webp"
      alt=""
      fill
      priority={priority}
      sizes="100vw"
      className="object-contain"
    />
  );
}

export default function HomeHero() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, (v) => v * -0.3);
  const opacity = useTransform(scrollY, fade);

  return (
    <>
      <motion.div
        aria-hidden="true"
        style={{ y, opacity }}
        className={`pointer-events-none fixed inset-x-0 top-14 z-0 ${HERO_H} will-change-transform md:top-[var(--header-h)] motion-reduce:hidden`}
      >
        {/* The likely LCP element on every viewport, so it alone is preloaded. */}
        <Illustration priority />
      </motion.div>
      <section className={`relative z-[1] ${HERO_H}`}>
        <div className="absolute inset-0 hidden motion-reduce:block">
          <Illustration />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <h1 className="m-0 leading-none">
            <Image
              src="/logo-tesla-2048w.png"
              alt="StudentX"
              width={2048}
              height={183}
              loading="eager"
              className="w-[62vw] max-w-4xl h-auto px-4"
            />
          </h1>
          {/* Bobs three times (~4.8s) and stops: under WCAG 2.2.2's five-second
              limit for motion that starts on its own. CSS, so it runs on the
              compositor rather than a JS loop. */}
          <span className="text-blue animate-[sx-cue-bob_1.6s_ease-in-out_3] motion-reduce:animate-none">
            <Icon name="chevronDown" className="w-[34px] h-[34px]" strokeWidth={2.25} />
          </span>
        </div>
      </section>
    </>
  );
}
