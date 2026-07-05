'use client';

import { useRef } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useReducedMotion } from 'motion/react';

const IRIS = '#635BFF';

// Down-chevron scroll cue shown beneath the wordmark.
function ChevronDown() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// Scroll-driven homepage hero: a prepared landscape illustration (white canvas)
// is shown in full on a white stage with the StudentX wordmark + a scroll cue
// overlaid. As the visitor scrolls, the logo group drifts up and fades and the
// image gently scales — then the sticky stage releases and the hub buttons
// (rendered by page.js below this component) scroll into view.
//
// The image is shown with object-contain on a white background: because the
// artwork's own canvas is white, the contained letterboxing is invisible — the
// whole image is always visible with no crop, on every screen size.
//
// The outer track is 200vh; the inner stage is sticky and 100vh, so the image
// stays pinned for the first ~100vh of scroll. scrollYProgress runs 0→1 over
// the full track and the sticky stage releases at progress 0.5, so the logo
// fade completes by then for a clean hand-off into the buttons section.
export default function HomeHero() {
  const targetRef = useRef(null);
  const prefersReduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ['start start', 'end start'],
  });

  const logoY = useTransform(scrollYProgress, [0, 0.5], [0, -200]);
  const logoOpacity = useTransform(scrollYProgress, [0, 0.3, 0.5], [1, 1, 0]);
  const photoScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.06]);

  // Reduced motion: a single static viewport (no scroll track) so the buttons
  // below stay reachable by normal scrolling. Mirrors the prefers-reduced-motion
  // handling already in globals.css (Bauhaus loader).
  if (prefersReduced) {
    return (
      <section className="relative h-screen overflow-hidden bg-stone">
        <Image
          src="/home-hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-contain"
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6">
          <Image
            src="/logo-tesla-2048w.png"
            alt="StudentX"
            width={2048}
            height={183}
            priority
            className="h-10 w-auto px-4 sm:h-14"
          />
          <span style={{ color: IRIS }}>
            <ChevronDown />
          </span>
        </div>
      </section>
    );
  }

  return (
    <section ref={targetRef} className="relative h-[200vh]">
      <div className="sticky top-0 h-screen overflow-hidden bg-stone">
        <motion.div style={{ scale: photoScale }} className="absolute inset-0">
          <Image
            src="/home-hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-contain"
          />
        </motion.div>

        <motion.div
          style={{ y: logoY, opacity: logoOpacity }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-6"
        >
          <Image
            src="/logo-tesla-2048w.png"
            alt="StudentX"
            width={2048}
            height={183}
            priority
            className="h-10 w-auto px-4 sm:h-14 md:h-16"
          />
          <motion.span
            style={{ color: IRIS }}
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown />
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}
