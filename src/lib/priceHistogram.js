/**
 * Pure helpers for the results-page price-distribution histogram.
 *
 * Given a set of price-bearing rows ({ monthly_price }), these functions bucket
 * the monthly prices into a fixed set of bars so a compact chart can show where
 * the current budget cut lands. The results page feeds them the FULL city price
 * distribution (see /api/listings/price-distribution) — NOT just the in-budget
 * result set — so bars to the right of the budget marker represent supply
 * priced above the student's max. Kept dependency-free and side-effect-free so
 * it's trivially unit-testable.
 */

/**
 * Build evenly-spaced price buckets across [min, max] and tally how many
 * listings fall into each. Prices at or below the bucket's upper edge (and
 * above the previous edge) count toward that bucket; the final bucket is
 * inclusive of `max` and also absorbs any price above `max` so nothing is
 * silently dropped.
 *
 * @param {Array<{ monthly_price?: number|null }>} listings - fetched listings.
 * @param {object} [opts]
 * @param {number} [opts.min=250]    - lower bound of the first bucket.
 * @param {number} [opts.max=1200]   - upper bound of the last bucket.
 * @param {number} [opts.buckets=12] - number of buckets.
 * @returns {Array<{ from: number, to: number, count: number }>} ordered buckets.
 */
export function buildPriceHistogram(listings, opts = {}) {
  const min = Number.isFinite(opts.min) ? opts.min : 250;
  const max = Number.isFinite(opts.max) ? opts.max : 1200;
  const bucketCount = Number.isFinite(opts.buckets) && opts.buckets > 0 ? Math.floor(opts.buckets) : 12;

  if (max <= min) return [];

  const span = max - min;
  const step = span / bucketCount;

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    from: min + step * i,
    to: min + step * (i + 1),
    count: 0,
  }));

  for (const listing of listings || []) {
    const price = listing?.monthly_price;
    if (typeof price !== 'number' || !Number.isFinite(price)) continue;

    // Clamp into range, then map to a bucket index. Anything <= min lands in
    // the first bucket; anything >= max lands in the last.
    let idx = Math.floor((price - min) / step);
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx].count += 1;
  }

  return buckets;
}

/**
 * Largest bucket count in a histogram — the denominator for bar heights.
 * Returns 0 for an empty/all-zero histogram so callers can short-circuit.
 *
 * @param {Array<{ count: number }>} histogram
 * @returns {number}
 */
export function maxBucketCount(histogram) {
  let peak = 0;
  for (const b of histogram || []) {
    if (b.count > peak) peak = b.count;
  }
  return peak;
}

/**
 * Whether a bucket sits within the chosen budget. A bucket is "in budget" when
 * its lower edge is at or below the budget — i.e. at least part of the bucket's
 * price range is affordable. This makes the bar containing the budget threshold
 * read as in-budget, with everything strictly above it dimmed.
 *
 * @param {{ from: number }} bucket
 * @param {number} budget
 * @returns {boolean}
 */
export function isBucketInBudget(bucket, budget) {
  if (typeof budget !== 'number' || !Number.isFinite(budget)) return true;
  return bucket.from <= budget;
}
