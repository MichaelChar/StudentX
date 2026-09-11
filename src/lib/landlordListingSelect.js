// Shared listing-select definitions for the landlord-owned listings view.
// Imported by BOTH the listings API route (src/app/api/landlord/listings/route.js)
// and the server-rendered dashboard (#254) so the column set + the pre-migration
// fallback can't drift between them.

export const LANDLORD_LISTING_SELECT = `
  listing_id,
  landlord_id,
  title,
  rent_id,
  location_id,
  property_type_id,
  description,
  photos,
  sqm,
  floor,
  available_from,
  available_to,
  min_duration_months,
  max_duration_months,
  bedrooms,
  bathrooms,
  listing_status,
  flags,
  created_at,
  updated_at,
  rent ( rent_id, monthly_price, currency, bills_included, deposit ),
  location ( location_id, address, neighborhood, lat, lng ),
  property_types ( property_type_id, name ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  property_verifications ( verification_id, method, status, verified_at, checklist_json, notes, created_at ),
  bookings ( count )
`;

// Pre-migration fallback: identical to LANDLORD_LISTING_SELECT minus columns
// that may not yet exist in prod. When adding a column to LANDLORD_LISTING_SELECT
// that ships ahead of its migration, also omit it here so the query can degrade
// gracefully instead of darking the landlord portal.
export const LANDLORD_LISTING_SELECT_FALLBACK = `
  listing_id,
  landlord_id,
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
 * Whether a listing has any bookings, from the `bookings ( count )` embed.
 *
 * Drives the disabled state on Delete (#519): `bookings` is the one FK that
 * RESTRICTs rather than cascades — that history must survive — so deleting
 * such a listing is refused with a 409. Showing an enabled button that always
 * fails is worse than showing a disabled one that explains itself.
 *
 * Defaults to FALSE when the embed is absent, which matters: the
 * pre-migration fallback select omits it, and PostgREST would drop it on a
 * relationship change. False means the button stays enabled and the landlord
 * gets the 409 with its explanation — the previous behaviour, which is a safe
 * floor. Defaulting to true would hide Delete from listings that can be
 * deleted, and no error would ever tell them why.
 *
 * @param {{ bookings?: Array<{ count?: number }> }} row
 */
export function listingHasBookings(row) {
  const embed = row?.bookings;
  if (!Array.isArray(embed) || embed.length === 0) return false;
  return Number(embed[0]?.count) > 0;
}

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
