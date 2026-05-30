'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useMotionValue } from 'motion/react';
import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';
import { variantUrl } from '@/lib/photoVariants';

/*
  Full-screen photo lightbox for the listing detail page (Item 8).

  - Swipe between photos with the same motion-drag mechanic as the
    directory carousel: dragConstraints lock the track x to ~0, the spring
    `animate.translateX` drives the page, and onDragEnd snaps the index.
  - Tap (or the zoom button) toggles zoom on the active photo; pinch on
    touch devices scales it; when zoomed the photo pans and track-swipe is
    suspended.
  - Esc closes, Arrow keys navigate, focus is trapped, body scroll locked.
  - Keeps next/image (object-contain) + real alt text — no background-image.
*/

const SPRING = { type: 'spring', mass: 3, stiffness: 400, damping: 50 };
const DRAG_BUFFER = 50;
const MAX_ZOOM = 4;
const TAP_ZOOM = 2.5;

function touchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

export default function ListingLightbox({ photos, title, startIndex = 0, onClose }) {
  const t = useTranslations('propylaea.gallery');
  const [index, setIndex] = useState(startIndex);
  const [scale, setScale] = useState(1);

  const dragX = useMotionValue(0);
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  const zoomed = scale > 1;
  const maxIndex = photos.length - 1;

  const go = useCallback(
    (next) => {
      setScale(1);
      setIndex((i) => Math.max(0, Math.min(next, maxIndex)));
    },
    [maxIndex],
  );

  // Lock body scroll while open; restore focus to the trigger on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'Tab') {
      // Minimal focus trap across the dialog's interactive controls.
      const focusables = dialogRef.current?.querySelectorAll(
        'button:not([disabled]):not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('lightboxLabel')}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex flex-col bg-blue/95"
    >
      {/* Top bar — counter + close. Overlaid (absolute) so it doesn't consume
          flow height; the photo track reserves matching room via its top
          padding, keeping the image centered in the full viewport. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-4 text-white">
        <span className="font-display text-lg tabular-nums" aria-live="polite">
          {t('counter', { current: index + 1, total: photos.length })}
        </span>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Icon name="x" className="w-6 h-6" />
        </button>
      </div>

      {/* Photo track — full viewport height with symmetric vertical padding
          (~72px, matching the overlaid top bar) so the object-contain image
          and the prev/next arrows both center in the full viewport with equal
          head/foot whitespace. */}
      <div className="relative flex-1 overflow-hidden py-18">
        <motion.div
          className="flex h-full"
          drag={zoomed ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          style={{ x: dragX }}
          animate={{ translateX: `-${index * 100}%` }}
          transition={SPRING}
          onDragEnd={() => {
            const x = dragX.get();
            if (x <= -DRAG_BUFFER) go(index + 1);
            else if (x >= DRAG_BUFFER) go(index - 1);
          }}
        >
          {photos.map((src, i) => (
            <div
              key={src}
              className="relative shrink-0 w-full h-full"
              aria-hidden={i === index ? undefined : 'true'}
            >
              <ZoomableImage
                src={variantUrl(src, 'full')}
                alt={t('photoAlt', { title, number: i + 1 })}
                active={i === index}
                scale={i === index ? scale : 1}
                setScale={setScale}
                t={t}
              />
            </div>
          ))}
        </motion.div>

        {/* Prev / next — hidden while zoomed so panning isn't obstructed */}
        {photos.length > 1 && !zoomed && (
          <>
            <ArrowButton
              dir="prev"
              label={t('prev')}
              disabled={index === 0}
              onClick={() => go(index - 1)}
            />
            <ArrowButton
              dir="next"
              label={t('next')}
              disabled={index >= maxIndex}
              onClick={() => go(index + 1)}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}

function ZoomableImage({ src, alt, active, scale, setScale, t }) {
  const pinch = useRef({ startDist: 0, startScale: 1 });
  const zoomed = scale > 1;

  function onClick() {
    if (!active) return;
    setScale(zoomed ? 1 : TAP_ZOOM);
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      pinch.current = { startDist: touchDistance(e.touches), startScale: scale };
    }
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch.current.startDist > 0) {
      e.preventDefault();
      const ratio = touchDistance(e.touches) / pinch.current.startDist;
      const next = Math.min(MAX_ZOOM, Math.max(1, pinch.current.startScale * ratio));
      setScale(next);
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) {
      pinch.current.startDist = 0;
      if (scale < 1.1) setScale(1);
    }
  }

  return (
    <div
      className="relative w-full h-full flex items-center justify-center"
      style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={zoomed ? t('zoomOut') : t('zoomIn')}
        tabIndex={active ? 0 : -1}
        drag={zoomed}
        dragConstraints={{ left: -400, right: 400, top: -400, bottom: 400 }}
        dragElastic={0.1}
        animate={{ scale }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={`relative w-full h-full ${zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in'}`}
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="100vw"
          draggable={false}
          className="object-contain select-none pointer-events-none"
        />
      </motion.button>
    </div>
  );
}

function ArrowButton({ dir, label, disabled, onClick }) {
  const isPrev = dir === 'prev';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`absolute top-1/2 -translate-y-1/2 ${
        isPrev ? 'left-3' : 'right-3'
      } inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors disabled:opacity-25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
    >
      <Icon name="chevronRight" className={`w-6 h-6 ${isPrev ? 'rotate-180' : ''}`} />
    </button>
  );
}
