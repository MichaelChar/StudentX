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
  landlords!inner ( name, verified_tier, is_verified, verified_tier_rank, profile_photo_url ),
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
    let usedFallback = false;
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

    // SQL-level sort: tier rank → featured → user-chosen metric
    query = query
      .order('landlords(verified_tier_rank)', { ascending: true })
      .order('is_featured', { ascending: false });

    if (f.sortBy === 'price') {
      query = query.order('rent(monthly_price)', {
        ascending: f.sortOrder === 'asc',
        nullsFirst: false,
      });
    }

    let { data, error } = await query;

    // If query fails (e.g. verified_tier_rank column not yet migrated), retry without it
    if (error) {
      console.warn("Listings query failed, retrying without verified_tier:", error.message);
      usedFallback = true;
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

    // Sort: SQL handles tier rank → featured → price for sortBy=price.
    // Walk/transit need JS because faculty_distances is a to-many join.
    // Fallback path always needs JS (no .order() was applied).
    if (usedFallback || f.sortBy !== "price") {
      const tierRank = { verified_pro: 0, verified: 1, none: 2 };
      results.sort((a, b) => {
        const rankA = tierRank[a.verified_tier] ?? 2;
        const rankB = tierRank[b.verified_tier] ?? 2;
        if (rankA !== rankB) return rankA - rankB;

        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;

        let valA, valB;

        if (f.sortBy === "price") {
          valA = a.monthly_price;
          valB = b.monthly_price;
        } else if (f.sortBy === "walk_minutes") {
          valA = a.faculty_distances[0]?.walk_minutes ?? null;
          valB = b.faculty_distances[0]?.walk_minutes ?? null;
        } else if (f.sortBy === "transit_minutes") {
          valA = a.faculty_distances[0]?.transit_minutes ?? null;
          valB = b.faculty_distances[0]?.transit_minutes ?? null;
        }

        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        return f.sortOrder === "desc" ? valB - valA : valA - valB;
      });
    }

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
