'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Carousel from '@/components/ui/Carousel';
import Icon from '@/components/ui/Icon';

/*
  MobilePdpHero — the chromeless hero of the listing page on a phone
  (parity Feature 58).

  Below `md` the PDP has no header at all: the photo runs to both screen edges
  and to the top of the viewport, and the only controls are round buttons
  floating directly on the image. That is most of what makes the page read as
  an app rather than a website, and it works because Feature 56's bottom tab
  bar took over navigation — which is also why Feature 59 then hides that bar
  on this one route, leaving `backSlot` as the way out.

  Presentational only. `src` and `alt` arrive resolved and translated;
  `counterLabel` arrives as a formatter. This file does not call `variantUrl`,
  does not open a lightbox, and does not use `useTranslations`.

  FULL BLEED IS `-mx-5`, NOT A MOVED CALL SITE. The PDP body is
  `mx-auto max-w-6xl px-5`, and the hero has to escape that padding without
  being lifted out of the container it belongs to. Negative margin is the only
  thing that does it in place.

  Layering: everything drawn on the photo is `z-10`, the same rule `CardPhotos`
  follows. Nothing here goes above `z-20` — the sticky booking bar and the
  lightbox live above that and must not have to fight this component for it.
*/

// Below this, a pointer that moved is still a tap. Above it, the gesture was a
// swipe and must not also open the lightbox.
const TAP_SLOP_PX = 8;

function CounterPill({ label }) {
  return (
    // aria-hidden: `Carousel` already announces "3 of 28" per slide, and a
    // second live count is noise, not redundancy that helps.
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-pill bg-night/70 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
    >
      {label}
    </span>
  );
}

function EmptyHero() {
  return (
    <div className="flex aspect-[3/4] items-center justify-center bg-parchment">
      <Icon name="photo" className="h-16 w-16 text-night/20" />
    </div>
  );
}

export default function MobilePdpHero({
  photos = [],
  counterLabel,
  carouselLabel,
  onPhotoClick,
  backSlot,
  actionsSlot,
  className = '',
}) {
  /*
    Tap-vs-swipe. `Carousel` drags the track with motion, and a drag ends in a
    click on whichever slide was under the finger — so without this guard every
    swipe would also open the lightbox.

    A ref, not state: the value is read once inside the click handler that the
    same gesture produces, and rendering never depends on it. Written in an
    event handler rather than during render, so the React Compiler rule against
    render-phase ref writes is not in play.
  */
  const pointerStart = useRef(null);

  const onPointerDown = (e) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const makeClickHandler = (index) => (e) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (start) {
      const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (moved > TAP_SLOP_PX) return;
    }
    onPhotoClick?.(index);
  };

  const renderPhoto = (photo, index) => (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={makeClickHandler(index)}
      // The photo is not a control in its own right — the label belongs to the
      // action it performs, and the alt text below carries the content.
      aria-label={photo.alt}
      className="relative block aspect-[3/4] w-full cursor-zoom-in bg-parchment"
    >
      <Image
        src={photo.src}
        alt={photo.alt}
        fill
        // Only the first photo is the LCP element. Every other one is lazy —
        // a listing can carry twenty-plus and eagerly fetching them on a phone
        // is exactly the cost Feature 15 warned about on the results grid.
        priority={index === 0}
        sizes="100vw"
        className="object-cover"
      />
    </button>
  );

  const hasPhotos = photos.length > 0;
  const single = photos.length === 1;

  return (
    <div className={`relative -mx-5 ${className}`}>
      {!hasPhotos && <EmptyHero />}

      {/* One photo mounts no carousel and draws no counter — `CardPhotos`
          makes the same call, and a "1 / 1" pill is a control that says
          nothing. */}
      {single && renderPhoto(photos[0], 0)}

      {hasPhotos && !single && (
        <Carousel
          perView={1}
          label={carouselLabel}
          // No gutter. `Carousel` advances by translating the track a whole
          // multiple of its own width, so any gap accumulates as drift — at
          // `perView={1}` that is a visible sliver of the next photo by the
          // third page. A full-bleed hero wants the slides flush anyway.
          gap=""
          className="relative"
          renderControls={({ index }) => (
            <CounterPill label={counterLabel?.(index + 1, photos.length)} />
          )}
        >
          {photos.map((photo, i) => renderPhoto(photo, i))}
        </Carousel>
      )}

      {/* Slots render nothing when absent rather than holding an empty box.
          Their innards are the caller's — this only decides where they sit. */}
      {backSlot && <div className="absolute left-3 top-3 z-10">{backSlot}</div>}
      {actionsSlot && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {actionsSlot}
        </div>
      )}
    </div>
  );
}
