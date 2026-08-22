'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Carousel from '@/components/ui/Carousel';
import Icon from '@/components/ui/Icon';
import { variantUrl } from '@/lib/photoVariants';

/*
  CardPhotos — the swipeable photo strip inside a result card (parity Feature 16).

  Two constraints from the feature decision, both load-bearing:

  1. **`z-10` or it breaks.** `ListingCard` is a stretched-link card: an
     absolute transparent <Link> at `z-0` covers the whole thing. Anything
     interactive on the photo must sit at `z-10`, or clicking an arrow or a dot
     opens the listing instead of advancing the photo.

  2. **Lazy-init.** Feature 15 puts EIGHTEEN cards on a results page. Mounting
     eighteen `motion` drag carousels on load is exactly the cost that decision
     warned about, so this renders a plain <Image> until the card is first
     touched, hovered or focused, and only then mounts the real carousel.
     Pre-mount it still draws the dot row, so the card does not visibly change
     shape at the moment of activation — only the dots become live.

  A single-photo listing never mounts a carousel at all; it stays an <Image>
  forever and draws no dots.

  ACTIVATION LISTENS ON THE CARD, NOT ON THIS ELEMENT — and that is not a
  stylistic choice. The stretched <Link> is absolutely positioned over the
  whole card and paints above the photo, so a pointer over the image hits the
  LINK; a handler on this wrapper would never fire and the carousel would never
  mount. (Verified in a browser: zero carousels after hover.) The listener
  therefore goes on the nearest card ancestor, which IS an ancestor of the
  link, so `pointerenter` / `focusin` / `touchstart` reach it normally.
*/

function isValidPhotoUrl(url) {
  return typeof url === 'string' && url.startsWith('http');
}

function Dots({ count, index, goTo }) {
  return (
    // Dots sit ON the photo, so they need the z-10 layer and their own
    // contrast — a dark scrim under them would fight the image.
    <div className="absolute inset-x-0 bottom-2.5 z-10 flex justify-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          // Presentational when there is nothing to click yet (pre-mount);
          // a real control once the carousel is live.
          {...(goTo
            ? {
                role: 'button',
                tabIndex: -1,
                onClick: (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                },
              }
            : { 'aria-hidden': 'true' })}
          className={`h-1.5 w-1.5 rounded-full transition-[background-color,transform] ${
            i === index
              ? 'bg-white scale-110'
              : 'bg-white/55 hover:bg-white/80'
          } shadow-[0_0_2px_rgba(10,37,64,0.45)]`}
        />
      ))}
    </div>
  );
}

function Arrow({ dir, onClick, disabled }) {
  return (
    <button
      type="button"
      // Not reachable by Tab: the photos are decorative alternates of a listing
      // the card already links to, and eighteen cards x two arrows would add
      // thirty-six stops between one card and the next. Drag and dots cover
      // pointer and touch; the listing page has the full gallery.
      tabIndex={-1}
      aria-hidden="true"
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 z-10 -translate-y-1/2 ${dir === 'prev' ? 'left-2' : 'right-2'}
        inline-flex h-7 w-7 items-center justify-center rounded-full
        bg-white/90 text-night shadow-[0_1px_4px_rgba(10,37,64,0.3)]
        opacity-0 transition-[opacity,background-color,transform]
        group-hover:opacity-100 focus-visible:opacity-100
        hover:bg-white active:scale-95
        disabled:opacity-0 disabled:cursor-default`}
    >
      <Icon name="chevronRight" className={`h-4 w-4 ${dir === 'prev' ? 'rotate-180' : ''}`} />
    </button>
  );
}

export default function CardPhotos({ photos, alt, sizes }) {
  const [live, setLive] = useState(false);
  const rootRef = useRef(null);
  const valid = (photos ?? []).filter(isValidPhotoUrl);
  const multi = valid.length > 1;

  useEffect(() => {
    // Nothing to arm for a single photo, and once live the listeners are done.
    if (!multi || live) return;
    const card = rootRef.current?.closest('[data-listing-card]');
    if (!card) return;
    const activate = () => setLive(true);
    card.addEventListener('pointerenter', activate, { once: true });
    card.addEventListener('touchstart', activate, { once: true, passive: true });
    card.addEventListener('focusin', activate, { once: true });
    return () => {
      card.removeEventListener('pointerenter', activate);
      card.removeEventListener('touchstart', activate);
      card.removeEventListener('focusin', activate);
    };
  }, [multi, live]);

  if (valid.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-night/20">
        <Icon name="photo" className="h-10 w-10" />
      </div>
    );
  }

  if (!live) {
    return (
      <div ref={rootRef} className="h-full w-full">
        <Image
          src={variantUrl(valid[0], 'card')}
          alt={alt}
          fill
          className="object-cover"
          sizes={sizes}
        />
        {multi && <Dots count={valid.length} index={0} />}
      </div>
    );
  }

  return (
    <Carousel
      perView={1}
      label={alt}
      gap="gap-0"
      className="h-full w-full"
      renderControls={({ index, pageCount, goTo, canPrev, canNext }) => (
        <>
          <Arrow dir="prev" onClick={() => goTo(index - 1)} disabled={!canPrev} />
          <Arrow dir="next" onClick={() => goTo(index + 1)} disabled={!canNext} />
          <Dots count={pageCount} index={index} goTo={goTo} />
        </>
      )}
    >
      {valid.map((url, i) => (
        <div key={url} className="relative aspect-[4/3] w-full">
          <Image
            src={variantUrl(url, 'card')}
            alt={i === 0 ? alt : ''}
            fill
            className="object-cover"
            sizes={sizes}
            // Only the first photo is worth eager consideration; the rest are
            // behind an interaction that has already happened by now.
            loading={i === 0 ? undefined : 'lazy'}
          />
        </div>
      ))}
    </Carousel>
  );
}
