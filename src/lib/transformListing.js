import { pickCompletedPropertyVerification } from '@/lib/propertyVerification';

/**
 * Decimal places kept in a coarsened coordinate.
 *
 * 3dp is ~110m at this latitude. Deliberately the same grid
 * `lib/mapBounds.js` quantises bounds to, so a coarsened pin and a bounds
 * query agree instead of disagreeing by a rounding step.
 */
export const LOCATION_PRECISION = 3;

/**
 * Round a coordinate to the public grid, or pass it through untouched.
 *
 * Plain rounding rather than a random offset: it is deterministic, so the
 * same listing lands in the same place on every request and across every
 * surface. A per-request jitter would make a pin visibly wander between the
 * results map and the detail page, which reads as a bug.
 *
 * @param {number|null} value
 * @param {boolean} precise
 * @returns {number|null}
 */
export function coarsenCoord(value, precise) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (precise) return value;
  const factor = 10 ** LOCATION_PRECISION;
  // `+ 0` normalises -0, which would otherwise serialise as "-0".
  return Math.round(value * factor) / factor + 0;
}

/**
 * Transforms a raw Supabase listing row (with joined dimension tables)
 * into the flat API response shape defined in docs/api-contracts.md.
 *
 * @param {object} row  raw Supabase row
 * @param {object} [opts]
 * @param {boolean} [opts.precise=false]
 *   Include the exact street address and full-precision coordinates.
 *
 *   **Defaults to false, and the default is the point.** Every current call
 *   site is a public or pre-booking surface, so nothing opts in today. A new
 *   caller that forgets this option leaks nothing; one that needs the real
 *   address has to ask for it, in a line a reviewer will notice. The reverse
 *   default — precise unless suppressed — is how prod ended up serving house
 *   numbers to anonymous callers in the first place.
 *
 *   Post-booking delivery does NOT come through here: the bookings API reads
 *   `listing.location` directly, so confirmed guests are unaffected.
 */
export function transformListing(row, { precise = false } = {}) {
  const is_verified = row.landlords?.is_verified ?? false;
  // Property-level verification (W4 video call) — separate from landlord
  // ID check above. Only rows with verified_at set count; pending/rejected
  // requests stay off the public badge.
  const property_verification = pickCompletedPropertyVerification(
    row.property_verifications,
  );

  return {
    listing_id: row.listing_id,
    is_verified,
    property_verified: property_verification != null,
    property_verification,
    // Denormalised host response latency (landlords.avg_response_ms; cron
    // refresh-response-times). Used for public search ranking + display
    // buckets; NULL = unknown. response_stats_at is anon-selectable after
    // migration 103 so the pure bucketer can drop stale stats on the
    // public join without a second query.
    avg_response_ms: row.landlords?.avg_response_ms ?? null,
    response_stats_at: row.landlords?.response_stats_at ?? null,
    title: row.title ?? null,
    /*
      LOCATION IS COARSENED BY DEFAULT. See `precise` in the JSDoc above.

      A listing is someone's home. Until a booking is confirmed there is no
      reason for the public payload to carry the house number or a coordinate
      good to a few centimetres, and prod was serving both to anyone who
      curled the URL.

      `address` is withheld rather than truncated: "Plateia Laodigitrias"
      without the number still identifies a short street, and half an address
      invites the reader to assume the rest is accurate.

      Coordinates are rounded to LOCATION_PRECISION (~110m at this latitude),
      which is enough to place a pin in the right block and not enough to pick
      the door. Nothing public needs better: map pins sit at city zoom where
      110m is sub-pixel, bounds search is already quantised to the same grid,
      and commute distances are precomputed server-side into
      `faculty_distances` from the exact values — they are never derived in
      the browser.
    */
    address: precise ? (row.location?.address ?? null) : null,
    neighborhood: row.location?.neighborhood ?? null,
    lat: coarsenCoord(row.location?.lat ?? null, precise),
    lng: coarsenCoord(row.location?.lng ?? null, precise),
    monthly_price: row.rent?.monthly_price ?? null,
    currency: row.rent?.currency ?? "EUR",
    bills_included: row.rent?.bills_included ?? false,
    deposit: row.rent?.deposit ?? 0,
    property_type: row.property_types?.name ?? null,
    amenities: (row.listing_amenities ?? []).map((la) => la.amenities.name),
    description: row.description ?? null,
    floor: row.floor ?? null,
    sqm: row.sqm ?? null,
    bedrooms: row.bedrooms ?? null,
    bathrooms: row.bathrooms ?? null,
    available_from: row.available_from ?? null,
    available_to: row.available_to ?? null,
    max_duration_months: row.max_duration_months ?? null,
    smoking_allowed: row.smoking_allowed ?? null,
    pets_allowed: row.pets_allowed ?? null,
    additional_rules: row.additional_rules ?? null,
    photos: row.photos ?? [],
    min_duration_months: row.min_duration_months ?? null,
    // `contact_info` is deliberately NOT exposed here. It is owner-only PII
    // (the landlord's email / external contact URL) and this shape feeds the
    // public, unauthenticated /api/listings, /api/listings/[id], and SSR
    // render paths — returning it leaked every landlord's contact channel to
    // anonymous callers (security audit #1). The owner reads/edits it via
    // /api/landlord/profile; students reach landlords through the in-app
    // inquiry flow keyed on listing_id, never the raw contact string.
    landlord: {
      name: row.landlords?.name ?? null,
      // Public-safe: the avatar shown on listing cards and the landlord
      // profile page. Unlike contact_info (see the note above), this is
      // intentionally public — it's a photo the landlord uploads for display.
      profile_photo_url: row.landlords?.profile_photo_url ?? null,
    },
    // Landlord-reported metres to each university in the city. Distinct from
    // faculty_distances below: university granularity, metres not minutes, and
    // typed by the landlord rather than computed by OSRM (migration 066).
    // Sorted nearest-first here so every consumer — card, detail page, map
    // popup — gets the same order without repeating the sort.
    university_distances: (row.listing_university_distances ?? [])
      .map((ud) => ({
        university_id: ud.university_id,
        short_name: ud.universities?.short_name ?? null,
        name: ud.universities?.name ?? null,
        distance_meters: ud.distance_meters,
      }))
      .sort((a, b) => a.distance_meters - b.distance_meters),
    faculty_distances: (row.faculty_distances ?? []).map((fd) => ({
      faculty_id: fd.faculty_id,
      faculty_name: fd.faculties?.name ?? null,
      university: fd.faculties?.university ?? null,
      walk_minutes: fd.walk_minutes,
      transit_minutes: fd.transit_minutes,
    })),
  };
}

/**
 * Count of populated optional fields used for search ranking.
 * photos, description, amenities, sqm, floor — each contributes 0 or 1.
 */
export function listingCompleteness(listing) {
  let n = 0;
  if (Array.isArray(listing.photos) && listing.photos.length > 0) n += 1;
  if (typeof listing.description === 'string' && listing.description.trim()) n += 1;
  if (Array.isArray(listing.amenities) && listing.amenities.length > 0) n += 1;
  if (listing.sqm != null && listing.sqm !== '') n += 1;
  if (listing.floor != null && listing.floor !== '') n += 1;
  return n;
}
