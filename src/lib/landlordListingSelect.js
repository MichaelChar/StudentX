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
  return runWithFallback(supabase, (q) => q.eq('landlord_id', landlordId));
}

/**
 * Same listings, selected by the caller's AUTH USER id instead of landlord_id.
 *
 * WHY THIS EXISTS. `/api/landlord/listings` had no landlord_id to hand — it was
 * fetching one first, purely to feed the query below:
 *
 *     landlordIdForUser(...)        → round trip 1
 *     selectLandlordListings(...)   → round trip 2
 *
 * Two SEQUENTIAL Supabase round-trips where PostgREST can express the whole
 * thing as one, by filtering on the embedded `landlords` row. Measured against
 * prod with a real landlord session, 15 interleaved pairs:
 *
 *     two hops  min=0.194  median=0.218  p90=0.304
 *     one hop   min=0.101  median=0.117  p90=0.189
 *
 * The minimums being almost exactly 2:1 is the tell that this is a structural
 * round-trip saving rather than query cost or noise.
 *
 * THE FILTER IS LOAD-BEARING, NOT DEFENCE IN DEPTH. `listings` carries a
 * SELECT policy of `Public can read listings` with `USING (true)` for every
 * role — verified against prod's pg_policy. RLS does NOT scope listing reads to
 * their owner, so this filter is the ONLY thing standing between a landlord and
 * every other landlord's listings. Any future rewrite that drops it is a data
 * leak the moment a second landlord exists.
 *
 * `!inner` makes the embed a join rather than an optional expansion, so a
 * listing whose landlord doesn't match is excluded rather than returned with a
 * null embed. The embed itself is stripped from each row before returning, so
 * the shape callers see is identical to selectLandlordListings'.
 */
export async function selectLandlordListingsByAuthUser(supabase, authUserId) {
  const result = await runWithFallback(
    supabase,
    (q) => q.eq('landlords.auth_user_id', authUserId),
    true,
  );
  if (result.error || !Array.isArray(result.data)) return result;
  // Drop the join-only embed so the response shape doesn't change.
  return { ...result, data: result.data.map(({ landlords, ...row }) => row) };
}

/*
  Shared query runner: primary select, then the pre-migration fallback on
  error. `applyFilter` scopes the rows; `joinLandlords` adds the inner join
  the auth-user variant filters on.
*/
async function runWithFallback(supabase, applyFilter, joinLandlords = false) {
  const join = joinLandlords ? ', landlords!inner ( auth_user_id )' : '';

  const primary = await applyFilter(
    supabase.from('listings').select(LANDLORD_LISTING_SELECT + join),
  ).order('created_at', { ascending: false });
  if (!primary.error) return primary;

  console.warn(
    'Landlord listings query failed, retrying without min_duration_months:',
    primary.error.message,
  );
  return applyFilter(
    supabase.from('listings').select(LANDLORD_LISTING_SELECT_FALLBACK + join),
  ).order('created_at', { ascending: false });
}
