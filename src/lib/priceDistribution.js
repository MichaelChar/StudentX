import { getSupabase } from "@/lib/supabase";
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
} from "@/lib/listingFilters";

/**
 * Filter-aware price-distribution source for the results-page budget histogram,
 * lifted out of `/api/listings/price-distribution/route.js` (same move, and the
 * same reason, as `searchListings` in issue #443): it now has TWO callers. The
 * route keeps the HTTP contract; the results server component calls this
 * directly so the histogram is in the first HTML response rather than arriving
 * ~2.5s later, at the end of a post-hydration fetch waterfall.
 *
 * Returns ONLY the monthly rent of each listing in the student's current
 * search — same filter set as /api/listings (faculty, types, neighborhoods,
 * exclude_amenities, verified_only, min_duration, exclude_ground_floor,
 * require_bills_included, available_from), reusing the shared filter logic so
 * the two routes can't drift — with ONE deliberate exception: budget
 * (min_budget / max_budget) is ignored. The histogram needs above-budget
 * listings to stay visible behind the budget marker, so the distribution must
 * NOT collapse to the in-budget slice the result list already shows.
 *
 * v1 (#216) ignored ALL filters so one cached response served every visitor.
 * v2 (#218) trades that blanket edge-cacheability for accuracy: the response
 * now varies per filter combo, so each distinct query string caches separately
 * (s-maxage=300). The accepted trade-off — a student narrowing by neighborhood
 * sees that neighborhood's price spread, not the whole city's.
 *
 * The response stays prices-only — no per-listing payload. The SELECT carries
 * only the lean joins the filters need (no photos / description / address /
 * contact / faculty-distance detail), so it's far lighter than /api/listings.
 *
 * @param {URLSearchParams} searchParams
 */

// Lean SELECT: monthly_price + only the columns/joins the shared filters touch.
const PRICE_SELECT = `
  rent!inner ( monthly_price, bills_included ),
  location!inner ( neighborhood ),
  property_types!inner ( name ),
  landlords!inner ( is_verified ),
  faculty_distances ( faculty_id ),
  listing_amenities ( amenities ( name ) )
`;

// Fallback SELECT without is_verified for pre-migration compat
// (mirrors /api/listings' fallback — verified_only is skipped on this path).
const PRICE_SELECT_FALLBACK = `
  rent!inner ( monthly_price, bills_included ),
  location!inner ( neighborhood ),
  property_types!inner ( name ),
  landlords!inner ( name ),
  faculty_distances ( faculty_id ),
  listing_amenities ( amenities ( name ) )
`;

function priceOf(row) {
  // `rent` is a to-one embed (object), but guard against a PostgREST array shape.
  const rent = Array.isArray(row.rent) ? row.rent[0] : row.rent;
  return rent?.monthly_price;
}

function amenityNamesOf(row) {
  return (row.listing_amenities || [])
    .map((la) => {
      const a = Array.isArray(la.amenities) ? la.amenities[0] : la.amenities;
      return a?.name;
    })
    .filter(Boolean);
}

export async function fetchPriceDistribution(searchParams) {
  try {
    // Same non-budget filter parsing/validation as /api/listings. Budget params
    // are simply never read here, so they're ignored (not validated, not applied).
    const f = parseListingFilters(searchParams);
    if (f.error) {
      return { status: 400, body: { error: f.error } };
    }

    const supabase = getSupabase();

    // Amenity AND-filter: resolve qualifying listing_ids via SQL RPC
    const {
      listingIds: amenityListingIds,
      failed: amenityRpcFailed,
      empty: amenityEmpty,
    } = await resolveRequiredAmenityIds(supabase, f.excludeAmenities);

    if (amenityEmpty) {
      return { status: 200, body: { prices: [] } };
    }

    // Build query — identical filters to /api/listings, MINUS the two budget
    // clauses (the only divergence). Active listings only.
    let query = supabase.from("listings").select(PRICE_SELECT);
    query = query.eq("listing_status", "active");
    query = applyListingFilters(query, f, { amenityListingIds });

    let { data, error } = await query;

    // Retry without verified columns if they aren't migrated yet (mirrors
    // /api/listings — verified_only is dropped on the fallback path).
    if (error) {
      console.warn("price-distribution query failed, retrying without is_verified:", error.message);
      let fallbackQuery = supabase.from("listings").select(PRICE_SELECT_FALLBACK);
      fallbackQuery = fallbackQuery.eq("listing_status", "active");
      fallbackQuery = applyListingFilters(fallbackQuery, f, { fallback: true, amenityListingIds });
      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        console.error("price-distribution fallback query error:", fallbackResult.error);
        return { status: 500, body: { error: "Failed to fetch price distribution" } };
      }
      data = fallbackResult.data;
    }

    let rows = data || [];

    // Residual JS filters, mirroring /api/listings, so the price set matches the
    // listings set exactly (minus budget).
    if (f.excludeGroundFloor) {
      rows = rows.filter((row) => !hasGroundFloorTag(amenityNamesOf(row)));
    }
    if (f.excludeAmenities && amenityRpcFailed) {
      const required = f.excludeAmenities.split(",").map((a) => a.trim());
      rows = rows.filter((row) => hasAllRequiredAmenities(amenityNamesOf(row), required));
    }

    // Drop nulls / non-numbers so the client can bucket cleanly.
    const prices = rows
      .map(priceOf)
      .filter((p) => typeof p === "number" && Number.isFinite(p));

    return { status: 200, body: { prices } };
  } catch (err) {
    console.error("Unexpected error in fetchPriceDistribution:", err);
    return { status: 500, body: { error: "Internal server error" } };
  }
}
