'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import ListingCard from '@/components/ListingCard';
import Icon from '@/components/ui/Icon';

/*
  Item 7 — directory carousel.

  A horizontal CARD carousel of ListingCards for the Thessaloniki landing.
  Adapted from the reference SwipeCarousel (motion drag + spring snap) but:
    - renders ListingCards (not background-image divs),
    - uses container-relative percentage widths (no w-screen overflow),
    - auto-advance pauses on hover/focus and is disabled under
      prefers-reduced-motion,
    - iris palette + arrow-key support + labelled pager controls.

  Drag mechanic mirrors the reference: dragConstraints lock the track's x
  to ~0 (elastic tactile feedback only); the page position is driven by
  the spring `animate.translateX`. translateX is a percentage of the track
  box (== the viewport column width), so `-index * cardWidthPct` advances by
  exactly one card per index step.
*/

const SPRING = { type: 'spring', mass: 3, stiffness: 400, damping: 50 };
const DRAG_BUFFER = 50;
const AUTO_DELAY = 6000;
const MAX_CARDS = 9;

function perViewFor(width) {
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export default function DirectoryCarousel() {
  const t = useTranslations('propylaea.carousel');
  const prefersReduced = useReducedMotion();

  const [listings, setListings] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | empty
  const [perView, setPerView] = useState(1);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const dragX = useMotionValue(0);

  // Fetch the head of the directory. /api/listings already returns
  // SuperLandlords first (the single elevated status), so the head of the
  // list is the elevated set we want to surface in the carousel.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/listings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = (data?.listings || []).slice(0, MAX_CARDS);
        setListings(rows);
        setStatus(rows.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setStatus('empty');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Track how many cards fit so the translate math + clamping stay correct
  // across breakpoints. Set in an effect (not a render-time read of window)
  // to keep SSR output stable.
  useEffect(() => {
    const update = () => setPerView(perViewFor(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const maxIndex = Math.max(0, listings.length - perView);

  // Clamp when perView grows (resize) so we never strand past the last page.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIndex((i) => Math.min(i, maxIndex));
  }, [maxIndex]);

  // Auto-advance — disabled under reduced motion, while hovered/focused, or
  // when everything already fits on one page.
  useEffect(() => {
    if (prefersReduced || paused || maxIndex < 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, AUTO_DELAY);
    return () => clearInterval(id);
  }, [prefersReduced, paused, maxIndex]);

  const go = (next) => setIndex(Math.max(0, Math.min(next, maxIndex)));

  const onDragEnd = () => {
    const x = dragX.get();
    if (x <= -DRAG_BUFFER) go(index + 1);
    else if (x >= DRAG_BUFFER) go(index - 1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  };

  if (status === 'empty') return null;

  const cardWidthPct = 100 / perView;
  const pageCount = maxIndex + 1;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label={t('regionLabel')}
      className="mx-auto max-w-6xl px-5 py-16 md:py-20"
    >
      {/* Header: bilingual accent + view-all, with pager arrows on sm+ */}
      <div className="flex items-end justify-between gap-4 mb-8">
        <div>
          <p className="label-caps text-yellow mb-2">{t('eyebrow')}</p>
          <h2 className="font-display text-3xl md:text-4xl text-night leading-tight">
            {t('title')} <span className="italic text-yellow">{t('titleItalic')}</span>
          </h2>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/property/thessaloniki/results"
            className="hidden sm:inline label-caps text-blue hover:text-night transition-colors"
          >
            {t('viewAll')} →
          </Link>
          {pageCount > 1 && (
            <div className="hidden sm:flex items-center gap-2">
              <PagerArrow
                dir="prev"
                label={t('prev')}
                disabled={index === 0}
                onClick={() => go(index - 1)}
              />
              <PagerArrow
                dir="next"
                label={t('next')}
                disabled={index >= maxIndex}
                onClick={() => go(index + 1)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Viewport. tabIndex + onKeyDown give the track arrow-key control. */}
      <div
        className="relative overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue rounded-sm"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {status === 'loading' ? (
          <div className="flex">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 px-2.5"
                style={{ width: `${cardWidthPct}%` }}
              >
                <SkeletonCard />
              </div>
            ))}
          </div>
        ) : (
          <motion.div
            className="flex cursor-grab active:cursor-grabbing"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x: dragX }}
            animate={{ translateX: `-${index * cardWidthPct}%` }}
            transition={SPRING}
            onDragEnd={onDragEnd}
          >
            {listings.map((listing, i) => (
              <div
                key={listing.listing_id}
                role="group"
                aria-roledescription="slide"
                aria-label={t('slidePosition', { index: i + 1, total: listings.length })}
                className="shrink-0 px-2.5"
                style={{ width: `${cardWidthPct}%` }}
              >
                {/* motion suppresses the click after a drag, so the card
                    link only navigates on a clean tap — no extra guard. */}
                <ListingCard listing={listing} fromQuery="" />
              </div>
            ))}
          </motion.div>
        )}

        {/* Edge fades hint at off-screen cards (faded into the stone canvas). */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-stone to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-stone to-transparent" />
      </div>

      {/* Pager dots */}
      {pageCount > 1 && status === 'ready' && (
        <div className="mt-6 flex justify-center gap-2">
          {Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={t('goToSlide', { number: i + 1 })}
              aria-current={i === index ? 'true' : undefined}
              className={`h-2.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                i === index ? 'w-6 bg-blue' : 'w-2.5 bg-night/20 hover:bg-night/40'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PagerArrow({ dir, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-night/15 text-night/70 transition-colors hover:border-blue hover:text-blue disabled:opacity-30 disabled:hover:border-night/15 disabled:hover:text-night/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <Icon
        name="chevronRight"
        className={`w-4 h-4 ${dir === 'prev' ? 'rotate-180' : ''}`}
      />
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-sm border border-night/10 bg-white overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-parchment" />
      <div className="p-5 space-y-3">
        <div className="h-3 w-28 bg-parchment rounded" />
        <div className="h-5 w-3/4 bg-parchment rounded" />
        <div className="flex justify-between">
          <div className="h-3 w-20 bg-parchment rounded" />
          <div className="h-4 w-16 bg-parchment rounded" />
        </div>
      </div>
    </div>
  );
}
