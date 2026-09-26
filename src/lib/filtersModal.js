import {
  buildPriceHistogram,
  maxBucketCount,
} from '@/lib/priceHistogram';

/*
  Pure helpers for the Filters modal (parity Features 8 + 9).

  Kept out of the component so the value shape, histogram resolve, and
  "is this filter on?" questions are unit-testable without jsdom. The
  modal itself is a controlled view over this shape — results/page.js
  will keep owning state when it mounts this; nothing here fetches.
*/

// Mirrors the results-page histogram so the modal chart and the (soon
// deleted) sidebar agree on the same axis. Duplicated on purpose: the
// wiring PR must not have to import from a page module, and editing
// results/page.js in this PR is out of scope.
export const HISTOGRAM_MIN = 250;
export const HISTOGRAM_MAX = 1200;
export const HISTOGRAM_BUCKETS = 12;

// Below this many priced listings the 12-bar chart stops being a
// distribution: each listing is its own bucket, every non-empty bar hits
// 100% height, and the result reads as a rendering fault (three solid black
// blocks at 3 listings). resolveHistogram reports 'sparse' instead, and the
// modal states the price range in words.
export const HISTOGRAM_MIN_LISTINGS = 8;

// Feature 7 approved chip-row length. The modal shows this many amenity
// chips, with the rest behind "Show more". Caller supplies order.
export const AMENITY_PREVIEW_COUNT = 10;

// Stay-length options Feature 8 names. Labels are translated at the
// call site; this is only the value set the API already validates.
export const DURATION_MONTHS = [1, 5, 9];

export const EMPTY_VALUE = {
  minPrice: null,
  maxPrice: null,
  selectedTypes: [],
  minDuration: null,
  selectedAmenities: [],
  selectedNeighborhoods: [],
};

/**
 * Normalise an option list to `{ value, label }[]`.
 *
 * Callers already have translated labels, so the modal does not look
 * anything up. Strings (the neighborhoods endpoint today) pass through
 * as both value and label so the wiring PR can feed either shape.
 */
export function normalizeOptions(list) {
  if (!Array.isArray(list) || list.length === 0) return [];
  const out = [];
  for (const item of list) {
    if (item == null || item === '') continue;
    if (typeof item === 'string' || typeof item === 'number') {
      out.push({ value: item, label: String(item) });
      continue;
    }
    const value = item.value ?? item.id ?? item.slug ?? item.name;
    if (value == null || value === '') continue;
    const label = item.label ?? item.name ?? String(value);
    out.push({ value, label });
  }
  return out;
}

export function toggleInList(list, value) {
  const current = Array.isArray(list) ? list : [];
  return current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
}

/**
 * Parse a min/max price field.
 *   '' / null  → `{ value: null }`  (cleared)
 *   finite ≥ 0 → `{ value: number }`
 *   anything else → `{ invalid: true }` so the caller can ignore the
 *   keystroke rather than wiping a good value.
 */
export function parsePriceInput(raw) {
  if (raw == null || raw === '') return { value: null };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < 0) return { invalid: true };
  return { value: n };
}

export function hasActiveFilters(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.minPrice != null) return true;
  if (value.maxPrice != null) return true;
  if (value.minDuration != null) return true;
  if (Array.isArray(value.selectedTypes) && value.selectedTypes.length > 0) {
    return true;
  }
  if (
    Array.isArray(value.selectedAmenities) &&
    value.selectedAmenities.length > 0
  ) {
    return true;
  }
  if (
    Array.isArray(value.selectedNeighborhoods) &&
    value.selectedNeighborhoods.length > 0
  ) {
    return true;
  }
  return false;
}

/**
 * Reset the five modal fields. Spreads `value` first so extra keys the
 * parent already owns (moveIn, dealbreakers, …) survive until the
 * wiring PR drops them.
 */
export function clearFilters(value) {
  return {
    ...value,
    minPrice: null,
    maxPrice: null,
    selectedTypes: [],
    minDuration: null,
    selectedAmenities: [],
    selectedNeighborhoods: [],
  };
}

export function splitAmenities(amenities, previewCount = AMENITY_PREVIEW_COUNT) {
  const list = Array.isArray(amenities) ? amenities : [];
  const count = Number.isFinite(previewCount) && previewCount >= 0
    ? previewCount
    : AMENITY_PREVIEW_COUNT;
  return {
    preview: list.slice(0, count),
    rest: list.slice(count),
  };
}

/**
 * Feature 9: `null` / `undefined` means the count is not loaded yet —
 * never render that as "Show 0 places", which reads as no results.
 * `0` is a real empty set and must stay visible.
 */
export function isResultCountPending(resultCount) {
  return resultCount == null;
}

/**
 * A bucket overlaps the selected min/max. Either bound may be null
 * (no cut on that side). Matches the spirit of `isBucketInBudget` but
 * two-sided, because Feature 8 replaced the max-only slider with a
 * range.
 */
export function isBucketInRange(bucket, minPrice, maxPrice) {
  if (!bucket) return false;
  if (minPrice != null && Number.isFinite(minPrice) && bucket.to < minPrice) {
    return false;
  }
  if (maxPrice != null && Number.isFinite(maxPrice) && bucket.from > maxPrice) {
    return false;
  }
  return true;
}

/**
 * Accept the three shapes a caller might already have:
 *   null / undefined     → pending (skeleton)
 *   number[]             → raw `/api/listings/price-distribution` prices
 *   { from, to, count }[] → already bucketed via buildPriceHistogram
 *
 * The modal never fetches; this just turns whatever was passed into
 * bars, or into an empty/pending state.
 *
 * Raw prices below HISTOGRAM_MIN_LISTINGS resolve to 'sparse' with the
 * actual { min, max } so the caller can say the range in words. Pre-bucketed
 * input carries no exact prices, so it never goes sparse — bucket edges are
 * not prices, and quoting them as a range would be wrong.
 */
export function resolveHistogram(distribution) {
  if (distribution == null) return { status: 'pending', buckets: [] };
  if (!Array.isArray(distribution) || distribution.length === 0) {
    return { status: 'empty', buckets: [] };
  }

  const first = distribution[0];
  let buckets;
  if (typeof first === 'number') {
    const prices = distribution.filter((n) => typeof n === 'number' && Number.isFinite(n));
    if (prices.length === 0) return { status: 'empty', buckets: [] };
    if (prices.length < HISTOGRAM_MIN_LISTINGS) {
      return {
        status: 'sparse',
        buckets: [],
        range: { min: Math.min(...prices), max: Math.max(...prices) },
      };
    }
    const listings = prices.map((monthly_price) => ({ monthly_price }));
    buckets = buildPriceHistogram(listings, {
      min: HISTOGRAM_MIN,
      max: HISTOGRAM_MAX,
      buckets: HISTOGRAM_BUCKETS,
    });
  } else if (first && typeof first === 'object') {
    buckets = distribution.filter(
      (b) => b && typeof b.count === 'number' && Number.isFinite(b.count),
    );
  } else {
    return { status: 'empty', buckets: [] };
  }

  const peak = maxBucketCount(buckets);
  return { status: peak === 0 ? 'empty' : 'ready', buckets };
}
