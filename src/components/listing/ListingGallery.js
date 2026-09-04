'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { variantUrl } from '@/lib/photoVariants';
import ListingLightbox from '@/components/listing/ListingLightbox';
import GalleryMosaic from '@/components/listing/GalleryMosaic';
import MobilePdpHero from '@/components/listing/MobilePdpHero';

/*
  Listing photo gallery (Item 8) — replaces the old tall 2-column grid.

  An inline main image (next/image, real alt) plus a thumbnail strip. The
  last thumbnail collapses into a "+N" tile when there are more photos than
  fit. Tapping the main image (or the "+N" tile) opens the full-screen
  ListingLightbox, which handles swipe / zoom / counter / keyboard / focus
  trap. Thumbnails select which photo the main image shows.
*/

const MAX_THUMBS = 5;

export default function ListingGallery({
  photos,
  title,
  mosaic = false,
  // Feature 58 — below `md`, replace the mosaic with the full-bleed chromeless
  // hero. Opt-in for the same reason `mosaic` is: /gigs renders this component
  // too, and a gig is not a property.
  mobileHero = false,
  backSlot,
  actionsSlot,
}) {
  const t = useTranslations('propylaea.gallery');
  const [active, setActive] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const open = (i) => setLightboxIndex(i);
  const close = () => setLightboxIndex(null);

  const visible = photos.slice(0, MAX_THUMBS);
  const hiddenCount = photos.length - MAX_THUMBS;

  /*
    Feature 26 — the Airbnb mosaic, OPT-IN rather than the default.

    ListingGallery has three call sites: the property PDP, the landlord's
    wizard preview, and /gigs/[id]. Feature 26 is a Guest-PDP feature about
    property photography, and one gig already carries exactly 5 photos — so
    flipping the default would silently restyle a different product surface
    whose content type (tutoring, moving help) the spec never considered.

    The PDP and the wizard preview opt in; the preview must match what a
    student actually sees or it stops being a preview. Gigs keeps the
    main-image-plus-strip arrangement until someone decides otherwise.
  */
  if (mosaic) {
    return (
      <>
        {/*
          The two galleries are both in the DOM and swapped by CSS rather than
          by a width hook — a hook would either flash the wrong one at hydration
          or hold the LCP image back a frame.

          It costs nothing to load. The mosaic's hero and the mobile hero's
          first photo resolve to the SAME `full` variant, so that is one fetch
          on both breakpoints; the mosaic's 2×2 tiles already live inside
          `hidden md:grid` and are lazy, so a phone never asks for them; and
          the hero's photos 2..N are lazy too, so a desktop never asks for
          those. What is hidden is genuinely not fetched.
        */}
        {mobileHero && (
          <MobilePdpHero
            className="md:hidden"
            photos={photos.map((src, i) => ({
              src: variantUrl(src, 'full'),
              alt: t('photoAlt', { title, number: i + 1 }),
            }))}
            counterLabel={(current, total) => t('counter', { current, total })}
            carouselLabel={t('heroCarouselLabel')}
            onPhotoClick={open}
            backSlot={backSlot}
            actionsSlot={actionsSlot}
          />
        )}
        <div className={mobileHero ? 'hidden md:block' : undefined}>
        <GalleryMosaic
          photos={photos.map((src, i) => ({
            // Variant policy stays here, not in the presentational component:
            // the hero is a full-width render, the 2x2 tiles are quarter-width.
            src: variantUrl(src, 'full'),
            thumbSrc: variantUrl(src, 'card'),
            alt: t('photoAlt', { title, number: i + 1 }),
          }))}
          onPhotoClick={open}
          onShowAll={() => open(0)}
          showAllLabel={t('showAllPhotos')}
          openLabel={t('openLightbox')}
        />
        </div>
        <AnimatePresence>
          {lightboxIndex !== null && (
            <ListingLightbox
              photos={photos}
              title={title}
              startIndex={lightboxIndex}
              onClose={close}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <>
      {/* Main image — click opens the lightbox at the active photo */}
      <button
        type="button"
        onClick={() => open(active)}
        aria-label={t('openLightbox')}
        className="group relative block w-full aspect-[16/10] rounded-control overflow-hidden bg-parchment cursor-zoom-in transition-opacity active:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      >
        <Image
          src={variantUrl(photos[active], 'full')}
          alt={t('photoAlt', { title, number: active + 1 })}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </button>

      {/* Thumbnail strip */}
      {photos.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-3">
          {visible.map((src, i) => {
            const isMoreTile = i === MAX_THUMBS - 1 && hiddenCount > 0;
            if (isMoreTile) {
              return (
                <button
                  key={src}
                  type="button"
                  onClick={() => open(i)}
                  aria-label={t('moreLabel', { count: hiddenCount + 1 })}
                  className="relative aspect-square rounded-control overflow-hidden bg-night transition-opacity active:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                >
                  <Image
                    src={variantUrl(src, 'thumb')}
                    alt=""
                    fill
                    sizes="20vw"
                    className="object-cover opacity-40"
                  />
                  <span className="absolute inset-0 flex items-center justify-center font-display text-lg text-white">
                    {t('moreCount', { count: hiddenCount + 1 })}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={src}
                type="button"
                onClick={() => setActive(i)}
                aria-label={t('thumbnailAlt', { title, number: i + 1 })}
                aria-current={i === active ? 'true' : undefined}
                className={`relative aspect-square rounded-control overflow-hidden bg-parchment transition-opacity active:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
                  i === active
                    ? 'ring-2 ring-blue ring-offset-2 ring-offset-stone'
                    : 'opacity-80 hover:opacity-100'
                }`}
              >
                <Image
                  src={variantUrl(src, 'thumb')}
                  alt=""
                  fill
                  sizes="20vw"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {lightboxIndex !== null && (
          <ListingLightbox
            photos={photos}
            title={title}
            startIndex={lightboxIndex}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </>
  );
}
