'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useMotionValue, useReducedMotion } from 'motion/react';

/*
  Carousel — a horizontal, snap-per-page track of arbitrary children.

  Generalised out of `property/DirectoryCarousel`, which had the mechanic right
  but welded to one use: it fetches `/api/listings` and renders `ListingCard`s.
  This is the same drag + spring-snap engine with the content and the chrome
  taken out, so the PDP gallery, "more stays nearby" (P13) and the mobile photo
  strip can share it.

  NO NEW DEPENDENCY, deliberately. The F9 backlog line offers
  "embla-carousel-react + vaul (or hand-roll on motion@12)". `motion` is already
  a dependency and DirectoryCarousel already proves this mechanic works in
  production, so adopting embla would mean either shipping a second carousel
  engine in the Worker bundle or rewriting code that works. Neither buys
  anything the drag-and-snap here doesn't already do.

  The mechanic, since it is not obvious:

    `dragConstraints` pin the track's x to ~0, so the drag itself only provides
    elastic tactile feedback — it is NOT what moves the carousel. Position comes
    from the spring on `animate.translateX`, expressed as a PERCENTAGE of the
    track box. Because the track box is the viewport column, `-index *
    (100 / perView)` advances by exactly one card per index step at any
    `perView`, with no measuring and no resize observer.

  Motion rule (F5): only `transform` animates. `translateX` as a percentage is
  a transform, not a layout property — this never touches `left` or `width`.

  Accessibility: the track is a labelled `region` with
  `aria-roledescription="carousel"`, arrow keys page it, and each page is a
  `group` announcing "N of M". Pager dots and arrows are the CALLER's chrome —
  they differ per surface, so this exposes `index` / `pageCount` / `goTo` via
  the `renderControls` prop rather than baking in one look.
*/

const SPRING = { type: 'spring', mass: 3, stiffness: 400, damping: 50 };
// How far a drag must travel before it counts as a page turn. Below this the
// track springs back, so a hesitant swipe does not fire a navigation.
const DRAG_BUFFER = 50;

export default function Carousel({
  children,
  perView = 1,
  // Responsive override: { base, sm, lg } — resolved against window width.
  // Passed rather than measured so SSR renders a stable first frame.
  perViewAt,
  label,
  gap = 'gap-4',
  autoAdvanceMs = 0,
  className = '',
  renderControls,
}) {
  const prefersReduced = useReducedMotion();
  const items = Array.isArray(children) ? children : [children];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const dragX = useMotionValue(0);
  const trackId = useId();
  const rootRef = useRef(null);

  /*
    Responsive perView via `useSyncExternalStore` rather than an effect.

    The obvious version — read `window.innerWidth` in an effect and setState —
    trips this repo's React-Compiler rule `react-hooks/set-state-in-effect`,
    and it deserves to: it renders once at the wrong width and then again at
    the right one. `useSyncExternalStore` has a server snapshot, so SSR and the
    first client frame agree and there is no cascading render.
  */
  const subscribe = useCallback((cb) => {
    window.addEventListener('resize', cb);
    return () => window.removeEventListener('resize', cb);
  }, []);

  const getPerView = useCallback(() => {
    if (!perViewAt) return perView;
    const w = window.innerWidth;
    if (w >= 1024 && perViewAt.lg) return perViewAt.lg;
    if (w >= 640 && perViewAt.sm) return perViewAt.sm;
    return perViewAt.base ?? perView;
  }, [perViewAt, perView]);

  // Server (and pre-hydration) renders the narrowest case. A phone then needs
  // no correction at all, and a desktop corrects on the first commit.
  const getServerPerView = useCallback(
    () => (perViewAt ? perViewAt.base ?? perView : perView),
    [perViewAt, perView],
  );

  const resolvedPerView = useSyncExternalStore(subscribe, getPerView, getServerPerView);

  const maxIndex = Math.max(0, Math.ceil(items.length / resolvedPerView) - 1);
  const pageCount = maxIndex + 1;

  // Clamp during render rather than in an effect. If the viewport shrinks the
  // page count out from under us, an effect would paint one frame at the stale
  // index before correcting; deriving it means that frame never exists.
  const safeIndex = Math.min(index, maxIndex);

  const goTo = (next) => setIndex(Math.max(0, Math.min(next, maxIndex)));

  useEffect(() => {
    // Auto-advance is opt-in, and off entirely under reduced motion: content
    // that moves on its own is the clearest case of motion a user asked not to
    // see. It also pauses on hover/focus so it cannot yank a page away from
    // someone reading or tabbing through it.
    if (!autoAdvanceMs || prefersReduced || paused || maxIndex === 0) return;
    const id = setInterval(() => {
      setIndex((i) => (i >= maxIndex ? 0 : i + 1));
    }, autoAdvanceMs);
    return () => clearInterval(id);
  }, [autoAdvanceMs, prefersReduced, paused, maxIndex]);

  const onDragEnd = () => {
    const x = dragX.get();
    if (x <= -DRAG_BUFFER) goTo(safeIndex + 1);
    else if (x >= DRAG_BUFFER) goTo(safeIndex - 1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(safeIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(safeIndex - 1);
    }
  };

  if (!items.length) return null;

  const itemWidthPct = 100 / resolvedPerView;

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      className={className}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="overflow-hidden">
        <motion.div
          id={trackId}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          style={{ x: dragX }}
          onDragEnd={onDragEnd}
          animate={{ translateX: `-${safeIndex * itemWidthPct}%` }}
          transition={prefersReduced ? { duration: 0 } : SPRING}
          className={`flex cursor-grab active:cursor-grabbing ${gap}`}
        >
          {items.map((child, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${items.length}`}
              className="shrink-0"
              style={{ width: `${itemWidthPct}%` }}
            >
              {child}
            </div>
          ))}
        </motion.div>
      </div>

      {renderControls?.({
        index: safeIndex,
        pageCount,
        goTo,
        canPrev: safeIndex > 0,
        canNext: safeIndex < maxIndex,
      })}
    </div>
  );
}
