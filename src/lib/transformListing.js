import { pickCompletedPropertyVerification } from '@/lib/propertyVerification';

/**
 * Transforms a raw Supabase listing row (with joined dimension tables)
 * into the flat API response shape defined in docs/api-contracts.md.
 */
export function transformListing(row) {
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
    // buckets; NULL = unknown. response_stats_at is service-role-only on
    // the public join (no anon SELECT grant) — included when present so
    // the pure bucketer can drop stale stats without a second query.
    avg_response_ms: row.landlords?.avg_response_ms ?? null,
    response_stats_at: row.landlords?.response_stats_at ?? null,
    title: row.title ?? null,
    address: row.location?.address ?? null,
    neighborhood: row.location?.neighborhood ?? null,
    lat: row.location?.lat ?? null,
    lng: row.location?.lng ?? null,
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
    agency_fee: row.agency_fee ?? null,
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
