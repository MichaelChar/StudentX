'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CaretLeft, CaretRight } from './glyphs';

/*
  A property's photos: a large cropped hero with previous/next buttons and a
  count, a row of thumbnails, and a full-screen viewer (a <dialog>) that shows
  the whole photo at the height of the screen.

  Photos are CROPPED to fill the hero (his call, demo v7; Kushner, Related and
  Tishman Speyer all crop) and there is no "full size" button: clicking the
  photo opens the viewer. The cover is always photo 1.

  `children` render between the hero and the thumbnails (the name, story,
  details and the other-property arrows), matching the demo's order.
*/
export default function PropertyGallery({ num, photos, children }) {
  const t = useTranslations('showcase.property');
  const [i, setI] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const dialogRef = useRef(null);
  const thumbsRef = useRef(null);
  const n = photos.length;
  const go = useCallback((to) => setI(((to % n) + n) % n), [n]);

  // Keep the current thumbnail in view, centred.
  useEffect(() => {
    const row = thumbsRef.current;
    const b = row?.children[i];
    if (!b) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    row.scrollTo({ left: b.offsetLeft - row.clientWidth / 2 + b.offsetWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [i]);

  const openViewer = () => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    setViewerOpen(true);
  };
  const closeViewer = () => dialogRef.current?.close();

  const photo = photos[i];
  const count = t('count', { n: i + 1, total: n });

  /* eslint-disable @next/next/no-img-element -- images.unoptimized: the sizes in public/showcase are the sizes served */
  return (
    <>
      <div className="pp-hero">
        <img
          className="pp-hero-img"
          src={photo.src}
          width={photo.w}
          height={photo.h}
          alt={t('photoAlt', { num })}
          role="button"
          tabIndex={0}
          fetchPriority={i === 0 ? 'high' : undefined}
          onClick={openViewer}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openViewer();
            }
          }}
        />
        <button className="pbtn l" type="button" aria-label={t('prevPhoto')} onClick={() => go(i - 1)}>
          <CaretLeft />
        </button>
        <button className="pbtn r" type="button" aria-label={t('nextPhoto')} onClick={() => go(i + 1)}>
          <CaretRight />
        </button>
        <span className="pp-count" aria-live="polite">
          {count}
        </span>
      </div>

      <dialog
        ref={dialogRef}
        className="zoom"
        aria-label={t('viewer')}
        onClose={() => setViewerOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') go(i - 1);
          else if (e.key === 'ArrowRight') go(i + 1);
        }}
      >
        {viewerOpen && <img src={photo.src} width={photo.w} height={photo.h} alt="" onClick={closeViewer} />}
        <button className="zb zl" type="button" aria-label={t('prevPhoto')} onClick={() => go(i - 1)}>
          <CaretLeft />
        </button>
        <button className="zb zr" type="button" aria-label={t('nextPhoto')} onClick={() => go(i + 1)}>
          <CaretRight />
        </button>
        <button className="zb zx" type="button" onClick={closeViewer}>
          {t('close')}
        </button>
        <span className="zc">{count}</span>
      </dialog>

      {children}

      <div className="in">
        <div className="thumbs" ref={thumbsRef}>
          {photos.map((p, j) => (
            <button
              key={p.src}
              type="button"
              aria-label={t('thumb', { n: j + 1, total: n })}
              aria-current={j === i ? 'true' : undefined}
              onClick={() => go(j)}
            >
              <img src={p.thumb} width={p.tw} height={p.th} alt="" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      </div>
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}
