'use client';

import { useState } from 'react';

/*
  Avatar — circular portrait with an initials fallback.

  Falls back to initials on a parchment fill with night text when `src` is
  missing OR when the image fails to load. Checking for a falsy src is not
  enough: a 404, a blocked host, or a broken OAuth URL must not leave an
  empty circle.

  `src` is caller-controlled and may be an arbitrary URL (Supabase bucket,
  Google/Apple OAuth picture, a blob: preview). next/image is not used:
  next.config.mjs `images.remotePatterns` only allowlists three hosts
  (Wix, our Supabase project, Bergeinsatz), and a primitive that 400s on
  any other src is a silent break. The existing LandlordAvatar CAN use
  next/image because its photos are known to live on the allowlisted
  bucket — this generic primitive cannot make that assumption.

  `decorative` is for the case where the name is already rendered beside
  the portrait (host row, review card). The image then has alt="" and the
  whole control is aria-hidden so the name isn't announced twice.
*/

const SIZES = {
  xs: 'w-6 h-6 text-[10px]', // 24px
  sm: 'w-8 h-8 text-xs', // 32px
  md: 'w-10 h-10 text-sm', // 40px
  lg: 'w-16 h-16 text-lg', // 64px — "meet your host" scale
};

function initialsFromName(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  src,
  name = '',
  size = 'md',
  decorative = false,
  className = '',
}) {
  // Track the src that failed, not a boolean, so a later src change (new
  // photo uploaded, parent swapped the URL) retries instead of staying on
  // the fallback. Avoids a useEffect just to reset state.
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const initials = initialsFromName(name);
  const box = SIZES[size] || SIZES.md;

  return (
    <span
      className={
        `inline-flex items-center justify-center overflow-hidden rounded-full shrink-0 ` +
        `bg-parchment text-night font-sans font-semibold leading-none select-none ` +
        `${box} ${className}`
      }
      aria-hidden={decorative || undefined}
      role={!decorative && !showImage && name ? 'img' : undefined}
      aria-label={!decorative && !showImage && name ? name : undefined}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary caller-supplied URL; next/image would 400 for any host not in remotePatterns (see header comment)
        <img
          src={src}
          alt={decorative ? '' : name}
          onError={() => setFailedSrc(src)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
