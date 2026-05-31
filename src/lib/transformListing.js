/**
 * Transforms a raw Supabase listing row (with joined dimension tables)
 * into the flat API response shape defined in docs/api-contracts.md.
 */
export function transformListing(row) {
  // The three inputs to SuperLandlord status. SuperLandlord is the single
  // elevated tier: a landlord who is BOTH currently paying (`is_featured` —
  // an active/trialing subscription, kept in sync by the Stripe webhook) AND
  // verified (a paid verified tier + admin ID approval). `is_superlandlord`
  // is the one flag every public surface keys off — the golden halo, priority
  // ranking, the "SuperLandlord" pill, and the public landlord profile.
  const is_featured = row.is_featured ?? false;
  const verified_tier = row.landlords?.verified_tier ?? 'none';
  const is_verified = row.landlords?.is_verified ?? false;
  const is_superlandlord = is_featured && is_verified && verified_tier !== 'none';

  return {
    listing_id: row.listing_id,
    is_featured,
    verified_tier,
    is_verified,
    is_superlandlord,
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
    faculty_distances: (row.faculty_distances ?? []).map((fd) => ({
      faculty_id: fd.faculty_id,
      faculty_name: fd.faculties?.name ?? null,
      university: fd.faculties?.university ?? null,
      walk_minutes: fd.walk_minutes,
      transit_minutes: fd.transit_minutes,
    })),
  };
}
