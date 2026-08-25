/*
  Map-bounds ("search this area") parsing, validation and quantisation
  — parity Feature 14.

  Kept out of listingFilters.js on purpose. Bounds are read by /api/listings
  ONLY, not by the price-distribution or count-filtered routes: the budget
  histogram deliberately describes the whole search rather than the current
  viewport (issue #218), and silently scoping it to the map would make the
  chart disagree with the question it answers. Putting bounds in the shared
  parser would apply them to all three by default, which is the wrong default.
*/

const BOUND_PARAMS = ['min_lat', 'max_lat', 'min_lng', 'max_lng'];

/*
  Decimal places kept in a quantised bound.

  3dp ≈ 110m at this latitude — far finer than a student can aim a map pan, and
  coarse enough that small pointer wobbles land on the same value.

  This exists for CACHING, not for precision. Raw float bounds make every
  request a unique URL, so every bounds search is a guaranteed edge-cache miss
  to origin; the spec's own Feature 14 cost analysis names that as the first
  real cost of map search. Snapping means a student returning to roughly the
  same view reuses a cached response.

  §15 of the spec argues quantisation is unnecessary because the button only
  fires at a settled position. That is true of the request COUNT and irrelevant
  to the cache KEY — two students settling on "the city centre" still produce
  two different keys unless the value is snapped. It is also far cheaper to do
  now than to retrofit once bounds are in shareable URLs, which is what the
  2026-08-24 handoff asks for.
*/
export const BOUNDS_PRECISION = 3;

/**
 * Round one coordinate to the shared grid.
 *
 * @param {number} value
 * @returns {number}
 */
export function quantiseCoord(value) {
  const factor = 10 ** BOUNDS_PRECISION;
  // `+0` normalises -0 to 0, so a bound on the equator/prime meridian doesn't
  // serialise as "-0" and fork the cache key.
  return Math.round(value * factor) / factor + 0;
}

/**
 * Quantise a bounds object, expanding OUTWARD.
 *
 * Rounding both edges to nearest would let a listing sitting within ~55m of
 * the edge fall out of a box the student can see it inside — the pin is
 * visibly on screen but the card is gone. Flooring the minimums and ceiling
 * the maximums keeps the queried box a superset of the visible one, so the
 * error is always "shows one extra", never "hides one you can see".
 *
 * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bounds
 * @returns {{minLat:number,maxLat:number,minLng:number,maxLng:number}}
 */
export function quantiseBounds({ minLat, maxLat, minLng, maxLng }) {
  const factor = 10 ** BOUNDS_PRECISION;
  return {
    minLat: Math.floor(minLat * factor) / factor + 0,
    maxLat: Math.ceil(maxLat * factor) / factor + 0,
    minLng: Math.floor(minLng * factor) / factor + 0,
    maxLng: Math.ceil(maxLng * factor) / factor + 0,
  };
}

/**
 * Parse + validate the four bounds params.
 *
 * All four or none — a partial box is a caller bug, and guessing the missing
 * edge would silently answer a different question than the one asked.
 *
 * @param {URLSearchParams} searchParams
 * @returns {{bounds: object|null, error?: string}}
 *   `bounds` is null when no bounds were requested (the whole-city case).
 */
export function parseBoundsParams(searchParams) {
  const present = BOUND_PARAMS.filter((p) => searchParams.get(p) !== null);
  if (present.length === 0) return { bounds: null };
  if (present.length !== BOUND_PARAMS.length) {
    return {
      error: `bounds require all of ${BOUND_PARAMS.join(', ')} (got ${present.join(', ')})`,
    };
  }

  const values = {};
  for (const param of BOUND_PARAMS) {
    const n = Number(searchParams.get(param));
    if (!Number.isFinite(n)) {
      return { error: `${param} must be a number` };
    }
    values[param] = n;
  }

  const { min_lat: minLat, max_lat: maxLat, min_lng: minLng, max_lng: maxLng } = values;

  // Same sane-globe range migration 106 put on the column itself, so the API
  // rejects an impossible box rather than handing Postgres a query that can
  // only ever return nothing.
  if (minLat < -90 || maxLat > 90) {
    return { error: 'latitude bounds must be between -90 and 90' };
  }
  if (minLng < -180 || maxLng > 180) {
    return { error: 'longitude bounds must be between -180 and 180' };
  }
  if (minLat > maxLat) {
    return { error: 'min_lat must be less than or equal to max_lat' };
  }
  /*
    min_lng > max_lng is a box crossing the antimeridian, which is a legitimate
    viewport — just not one a single BETWEEN can express, and not one any
    supported city is near. Rejected explicitly so it fails loudly if a city
    ever lands out there, rather than quietly returning zero listings.
  */
  if (minLng > maxLng) {
    return { error: 'min_lng must be less than or equal to max_lng' };
  }

  return { bounds: quantiseBounds({ minLat, maxLat, minLng, maxLng }) };
}

/**
 * Apply a bounding box to a Supabase query builder.
 *
 * Backed by idx_location_lat_lng (migration 107). No-op when `bounds` is null,
 * so the whole-city search is untouched.
 *
 * @param query   a Supabase PostgREST query builder
 * @param {object|null} bounds  from {@link parseBoundsParams}
 */
export function applyBoundsFilter(query, bounds) {
  if (!bounds) return query;
  return query
    .gte('location.lat', bounds.minLat)
    .lte('location.lat', bounds.maxLat)
    .gte('location.lng', bounds.minLng)
    .lte('location.lng', bounds.maxLng);
}

/**
 * Serialise bounds for a URL, in the same quantised form the API will parse.
 *
 * Used by the results page so the URL, the request and the cache key all agree
 * — a shared link reproduces exactly the search that was run.
 *
 * @param {{minLat:number,maxLat:number,minLng:number,maxLng:number}} bounds
 * @returns {Record<string,string>}
 */
export function boundsToParams(bounds) {
  const q = quantiseBounds(bounds);
  return {
    min_lat: String(q.minLat),
    max_lat: String(q.maxLat),
    min_lng: String(q.minLng),
    max_lng: String(q.maxLng),
  };
}

/**
 * How far the viewport has moved since the last search, as a fraction of the
 * searched box's own size.
 *
 * Drives when `Search this area` appears. Expressed as a ratio rather than
 * metres so it behaves the same at every zoom: a half-pane pan reads as ~0.5
 * whether the pane covers 7km or 700m.
 *
 * @param {object|null} searched  bounds the current results were fetched for
 * @param {object|null} current   bounds of the map right now
 * @returns {number} 0 when nothing to compare
 */
export function boundsDrift(searched, current) {
  if (!searched || !current) return 0;

  const latSpan = Math.abs(searched.maxLat - searched.minLat);
  const lngSpan = Math.abs(searched.maxLng - searched.minLng);

  /*
    A zero-area baseline has no scale to measure against, so drift is not
    meaningfully defined — return 0 rather than a ratio.

    This is not hypothetical: Leaflet's `getBounds()` returns a single POINT
    while the map container is still unsized, which is exactly what it reports
    on mount. An earlier version divided by an epsilon instead, which made two
    IDENTICAL degenerate boxes read as drift = 1 and popped `Search this area`
    open on page load before the student had touched anything.
  */
  if (latSpan === 0 || lngSpan === 0) return 0;

  const centreLatDrift =
    Math.abs(
      (current.maxLat + current.minLat) / 2 - (searched.maxLat + searched.minLat) / 2,
    ) / latSpan;
  const centreLngDrift =
    Math.abs(
      (current.maxLng + current.minLng) / 2 - (searched.maxLng + searched.minLng) / 2,
    ) / lngSpan;

  // Zoom counts as movement too: zooming out without panning reveals area the
  // last search never covered, and the student has every reason to re-ask.
  const latZoomDrift = Math.abs(Math.abs(current.maxLat - current.minLat) - latSpan) / latSpan;
  const lngZoomDrift = Math.abs(Math.abs(current.maxLng - current.minLng) - lngSpan) / lngSpan;

  return Math.max(centreLatDrift, centreLngDrift, latZoomDrift, lngZoomDrift);
}

/*
  How far the map must move before `Search this area` offers itself.

  0.15 = 15% of a pane. Low enough that a deliberate pan surfaces it
  immediately, high enough that settling a drag or a trackpad nudge does not
  flash a button at someone who has not moved anywhere.
*/
export const BOUNDS_DRIFT_THRESHOLD = 0.15;
