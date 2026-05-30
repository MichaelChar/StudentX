'use client';

import { useState } from 'react';
import Image from 'next/image';
import { AnimatePresence } from 'motion/react';
import { useTranslations } from 'next-intl';
import { variantUrl } from '@/lib/photoVariants';
import ListingLightbox from '@/components/listing/ListingLightbox';

/*
  Listing photo gallery (Item 8) — replaces the old tall 2-column grid.

  An inline main image (next/image, real alt) plus a thumbnail strip. The
  last thumbnail collapses into a "+N" tile when there are more photos than
  fit. Tapping the main image (or the "+N" tile) opens the full-screen
  ListingLightbox, which handles swipe / zoom / counter / keyboard / focus
  trap. Thumbnails select which photo the main image shows.
*/

const MAX_THUMBS = 5;

export default function ListingGallery({ photos, title }) {
  const t = useTranslations('propylaea.gallery');
  const [active, setActive] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const open = (i) => setLightboxIndex(i);
  const close = () => setLightboxIndex(null);

  const visible = photos.slice(0, MAX_THUMBS);
  const hiddenCount = photos.length - MAX_THUMBS;

  return (
    <>
      {/* Main image — click opens the lightbox at the active photo */}
      <button
        type="button"
        onClick={() => open(active)}
        aria-label={t('openLightbox')}
        className="group relative block w-full aspect-[16/10] rounded-sm overflow-hidden bg-parchment cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
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
                  className="relative aspect-square rounded-sm overflow-hidden bg-night focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
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
                className={`relative aspect-square rounded-sm overflow-hidden bg-parchment transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
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
