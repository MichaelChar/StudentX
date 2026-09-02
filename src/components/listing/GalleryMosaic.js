'use client';

import Image from 'next/image';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';

/*
  GalleryMosaic — Airbnb PDP photo block (Feature 26).

  Presentational only. Copy arrives already translated; photos arrive
  already-resolved (`src` / `thumbSrc` / `alt`). This file does not open a
  lightbox, touch URLs, or call useTranslations — it raises onPhotoClick /
  onShowAll and stops.

  Mosaic vs hero is a hard split, not a sparse 2×2: a landlord with three
  shots (or five shots with a missing src in the first five) must not leave
  a hole. Filling a hole from photos[5+] was rejected because the contract
  says photos beyond the fifth are reachable only through "Show all photos".

  392px is the measured photo-block height. The 24px title-to-gallery gap
  is left to the parent — baking pt-6 in here would double-space once the
  PDP stack adds its own section padding (the failure ListingHighlights
  documented the other way around, because it IS the section).

  Outer rounding is on this wrapper (`rounded-photo` + overflow-hidden),
  not on individual tiles. Tile-level radii fight the 8px gutters and
  read as five cards; clipping the wrapper makes the five photos one unit.
*/

const MOSAIC_MIN = 5;

function hasSrc(photo) {
  return !!(
    photo &&
    typeof photo === 'object' &&
    typeof photo.src === 'string' &&
    photo.src
  );
}

function MosaicTile({ src, alt, label, onClick, priority = false, sizes }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="group relative block h-full min-h-0 min-w-0 w-full cursor-pointer overflow-hidden bg-parchment focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes={sizes}
        className="object-cover"
      />
      {/* Colour overlay, not scale: a neighbour-clipped scale is how a
          mosaic starts looking like five separate cards. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-night/20 opacity-0 transition-opacity group-hover:opacity-100 group-active:opacity-100"
      />
    </button>
  );
}

export default function GalleryMosaic({
  photos,
  onPhotoClick,
  onShowAll,
  showAllLabel,
  openLabel,
}) {
  if (!Array.isArray(photos) || photos.length === 0) return null;

  const heroIndex = photos.findIndex(hasSrc);
  if (heroIndex === -1) return null;

  const mosaicReady =
    photos.length >= MOSAIC_MIN &&
    [0, 1, 2, 3, 4].every((i) => hasSrc(photos[i]));

  const hero = photos[heroIndex];
  const heroAlt = typeof hero.alt === 'string' ? hero.alt : '';

  const handlePhotoClick = (index) => {
    if (typeof onPhotoClick === 'function') onPhotoClick(index);
  };

  return (
    <div className="relative h-[392px] w-full overflow-hidden rounded-photo bg-parchment">
      <div
        className={
          mosaicReady
            ? 'grid h-full grid-cols-1 gap-2 md:grid-cols-2'
            : 'grid h-full grid-cols-1'
        }
      >
        <MosaicTile
          src={hero.src}
          alt={heroAlt}
          label={openLabel}
          onClick={() => handlePhotoClick(heroIndex)}
          priority
          sizes={
            mosaicReady
              ? '(max-width: 767px) 100vw, 50vw'
              : '(max-width: 1152px) 100vw, 1152px'
          }
        />
        {mosaicReady ? (
          <div className="hidden h-full grid-cols-2 grid-rows-2 gap-2 md:grid">
            {photos.slice(1, MOSAIC_MIN).map((photo, offset) => {
              const index = offset + 1;
              const alt = typeof photo.alt === 'string' ? photo.alt : '';
              return (
                <MosaicTile
                  key={index}
                  src={photo.thumbSrc || photo.src}
                  alt={alt}
                  label={alt || openLabel}
                  onClick={() => handlePhotoClick(index)}
                  sizes="25vw"
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {/*
        Inline stone fill: Button.secondary is bg-transparent, and a
        className `bg-stone` is a source-order fight it can lose — a
        transparent control on an arbitrary photo fails the readable-pill
        requirement. Inline style wins without inventing a Button variant.
        Chip was rejected: it forces aria-pressed and this is not a toggle.
      */}
      <Button
        size="sm"
        variant="secondary"
        onClick={onShowAll}
        style={{ backgroundColor: 'var(--color-stone)' }}
        className="absolute right-6 bottom-6 z-10 shadow-[0_1px_6px_-1px_rgba(10,20,54,0.3)]"
      >
        <Icon name="photo" className="h-4 w-4" />
        {showAllLabel}
      </Button>
    </div>
  );
}
