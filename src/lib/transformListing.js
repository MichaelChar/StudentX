/**
 * Transforms a raw Supabase listing row (with joined dimension tables)
 * into the flat API response shape defined in docs/api-contracts.md.
 */
export function transformListing(row) {
  return {
    listing_id: row.listing_id,
    is_featured: row.is_featured ?? false,
    verified_tier: row.landlords?.verified_tier ?? 'none',
    is_verified: row.landlords?.is_verified ?? false,
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
    landlord: {
      name: row.landlords?.name ?? null,
      contact_info: row.landlords?.contact_info ?? null,
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
