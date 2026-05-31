import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { transformListing } from "@/lib/transformListing";
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
} from "@/lib/listingFilters";

const LISTING_SELECT = `
  listing_id,
  is_featured,
  title,
  description,
  photos,
  floor,
  min_duration_months,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, verified_tier, is_verified, profile_photo_url ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

// Fallback SELECT without is_featured/verified_tier for pre-migration compatibility
const LISTING_SELECT_FALLBACK = `
  listing_id,
  title,
  description,
  photos,
  floor,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) )
`;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Shared (non-budget) filter parsing + validation. Budget is handled inline
    // below — it's the one filter the price-distribution route drops (issue #218).
    const f = parseListingFilters(searchParams);
    if (f.error) {
      return NextResponse.json({ error: f.error }, { status: 400 });
    }

    const minBudget = searchParams.get("min_budget");
    const maxBudget = searchParams.get("max_budget");

    const supabase = getSupabase();

    // Amenity AND-filter: resolve qualifying listing_ids via SQL RPC
    const {
      listingIds: amenityListingIds,
      failed: amenityRpcFailed,
      empty: amenityEmpty,
    } = await resolveRequiredAmenityIds(supabase, f.excludeAmenities);

    if (amenityEmpty) {
      const response = NextResponse.json({ listings: [] });
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=300, stale-while-revalidate=600"
      );
      return response;
    }

    // Build query
    let query = supabase.from("listings").select(LISTING_SELECT);
    query = applyListingFilters(query, f, { amenityListingIds });

    // Filter: min budget
    if (minBudget) {
      const budget = Number(minBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "min_budget must be a positive number" },
          { status: 400 }
        );
      }
      query = query.gte("rent.monthly_price", budget);
    }

    // Filter: max budget
    if (maxBudget) {
      const budget = Number(maxBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "max_budget must be a positive number" },
          { status: 400 }
        );
      }
      query = query.lte("rent.monthly_price", budget);
    }

    // No DB-level ordering: ranking is computed in JS after transform (see the
    // sort below). The SuperLandlord predicate spans listing + joined landlord
    // columns, which a single .order() can't express cleanly.
    let { data, error } = await query;

    // If query fails (e.g. the verified columns aren't migrated yet), retry
    // with the reduced SELECT that omits them.
    if (error) {
      console.warn("Listings query failed, retrying without verified columns:", error.message);
      let fallbackQuery = supabase.from("listings").select(LISTING_SELECT_FALLBACK);
      fallbackQuery = applyListingFilters(fallbackQuery, f, { fallback: true, amenityListingIds });
      if (minBudget) fallbackQuery = fallbackQuery.gte("rent.monthly_price", Number(minBudget));
      if (maxBudget) fallbackQuery = fallbackQuery.lte("rent.monthly_price", Number(maxBudget));

      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        console.error("Supabase fallback query error:", fallbackResult.error);
        return NextResponse.json(
          { error: "Failed to fetch listings" },
          { status: 500 }
        );
      }
      data = fallbackResult.data;
    }

    // Transform rows to API shape
    let results = data.map(transformListing);

    // Residual amenity-tag check for excludeGroundFloor — the `floor != 0`
    // half is now in SQL above, so this only catches listings whose floor
    // is unset/non-zero but carry the "ground floor" amenity tag anyway.
    if (f.excludeGroundFloor) {
      results = results.filter((listing) => !hasGroundFloorTag(listing.amenities));
    }

    // Amenity AND-filter fallback: only needed when the SQL RPC was unavailable
    if (f.excludeAmenities && amenityRpcFailed) {
      const required = f.excludeAmenities.split(",").map((a) => a.trim());
      results = results.filter((listing) => hasAllRequiredAmenities(listing.amenities, required));
    }

    // Ranking: SuperLandlords (the single elevated status — paying AND
    // verified) float to the top, then the student's chosen metric within each
    // group, then newest-first as a deterministic tiebreaker. Done in JS for
    // every sort mode because the SuperLandlord predicate spans listing +
    // joined landlord columns and faculty_distances is a to-many join — neither
    // expressible as a single .order(). (The old verified_tier_rank → featured
    // gradient collapsed to this binary predicate in the SuperLandlord merge,
    // so verified_pro no longer outranks verified.)
    const metricValue = (listing) => {
      if (f.sortBy === "price") return listing.monthly_price;
      if (f.sortBy === "walk_minutes") return listing.faculty_distances[0]?.walk_minutes ?? null;
      if (f.sortBy === "transit_minutes") return listing.faculty_distances[0]?.transit_minutes ?? null;
      return null; // 'match'/default: SuperLandlord-first, then newest
    };

    results.sort((a, b) => {
      if (a.is_superlandlord !== b.is_superlandlord) return a.is_superlandlord ? -1 : 1;

      const valA = metricValue(a);
      const valB = metricValue(b);
      if (valA != null || valB != null) {
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (valA !== valB) return f.sortOrder === "desc" ? valB - valA : valA - valB;
      }

      // Deterministic tiebreaker: newest first (listing_id grows with recency).
      if (a.listing_id === b.listing_id) return 0;
      return a.listing_id < b.listing_id ? 1 : -1;
    });

    const response = NextResponse.json({ listings: results });
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );
    return response;
  } catch (err) {
    console.error("Unexpected error in GET /api/listings:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
