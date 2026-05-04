// Resolves the right size variant for a stored listing photo URL.
//
// New uploads (post-variant rollout) save three sized files alongside
// each other:  <stem>__thumb.<ext>, <stem>__card.<ext>, <stem>__full.<ext>.
// The URL stored in `listings.photos` is the CARD variant, since that's
// the most common display size and keeps any consumer that doesn't
// know about variants working with a sensible default.
//
// Legacy URLs — Wixstatic photos imported before the variant rollout,
// and Supabase uploads that predate it — don't carry the suffix and
// fall through unchanged. That makes this safe to roll out without a
// backfill: `variantUrl(legacyUrl, 'thumb')` returns the original URL,
// and the surface renders the original photo at full size.

const VARIANT_RE = /__(thumb|card|full)\.(webp|jpe?g)$/i;

/**
 * @param {string} url - the URL stored in listings.photos
 * @param {'thumb' | 'card' | 'full'} size
 * @returns {string} - the variant URL, or the original if not a known variant URL
 */
export function variantUrl(url, size = 'card') {
  if (typeof url !== 'string') return url;
  const match = url.match(VARIANT_RE);
  if (!match) return url;
  const [, , ext] = match;
  return url.replace(VARIANT_RE, `__${size}.${ext}`);
}
