// Shared listing-select definitions for the landlord-owned listings view.
// Imported by BOTH the listings API route (src/app/api/landlord/listings/route.js)
// and the server-rendered dashboard (#254) so the column set + the pre-migration
// fallback can't drift between them.

export const LANDLORD_LISTING_SELECT = `
  listing_id,
  landlord_id,
  is_featured,
  title,
  rent_id,
  location_id,
  property_type_id,
  description,
  photos,
  sqm,
  floor,
  available_from,
  min_duration_months,
  created_at,
  updated_at,
  rent ( rent_id, monthly_price, currency, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) )
`;

// Pre-migration fallback: identical to LANDLORD_LISTING_SELECT minus columns
// that may not yet exist in prod. When adding a column to LANDLORD_LISTING_SELECT
// that ships ahead of its migration, also omit it here so the query can degrade
// gracefully instead of darking the landlord portal.
export const LANDLORD_LISTING_SELECT_FALLBACK = `
  listing_id,
  landlord_id,
  is_featured,
  title,
  rent_id,
  location_id,
  property_type_id,
  description,
  photos,
  sqm,
  floor,
  available_from,
  created_at,
  updated_at,
  rent ( rent_id, monthly_price, currency, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) )
`;

/**
 * Fetch a landlord's own listings (newest first), with the pre-migration
 * fallback baked in. `supabase` MUST be token-scoped (RLS applies). Returns
 * the same `{ data, error }` shape as a Supabase query so callers keep their
 * own error handling. Single source of truth shared by the API route and the
 * server-rendered dashboard.
 */
export async function selectLandlordListings(supabase, landlordId) {
  const primary = await supabase
    .from('listings')
    .select(LANDLORD_LISTING_SELECT)
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false });
  if (!primary.error) return primary;

  console.warn(
    'Landlord listings query failed, retrying without min_duration_months:',
    primary.error.message,
  );
  return supabase
    .from('listings')
    .select(LANDLORD_LISTING_SELECT_FALLBACK)
    .eq('landlord_id', landlordId)
    .order('created_at', { ascending: false });
}
