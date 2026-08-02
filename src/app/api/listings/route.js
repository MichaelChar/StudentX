import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { transformListing } from "@/lib/transformListing";
import { compareListingsByRank } from "@/lib/listingRank";
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
} from "@/lib/listingFilters";
import { stayDurationMonths, durationFitsListing } from "@/lib/bookingDates";
import { listingIdsBlockedInRange } from "@/lib/bookingBlocks";

const LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  bedrooms,
  bathrooms,
  agency_fee,
  available_from,
  available_to,
  min_duration_months,
  max_duration_months,
  smoking_allowed,
  pets_allowed,
  additional_rules,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, is_verified, profile_photo_url, avg_response_ms, response_stats_at ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) ),
  property_verifications ( verification_id, method, verified_at )
`;

// Fallback SELECT for pre-migration compatibility (e.g. missing
// listing_university_distances from migration 066). Omits is_verified so a
// half-migrated env still answers; verified_only is skipped on that path.
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

    // Stay-range search: listing ids with overlapping pending/booked holds.
    // Filtered in JS after transform (avoids PostgREST not.in quoting quirks).
    let blockedIds = [];
    if (f.moveInDate && f.moveOutDate) {
      try {
        blockedIds = await listingIdsBlockedInRange(f.moveInDate, f.moveOutDate);
      } catch (err) {
        console.warn("listingIdsBlockedInRange failed:", err?.message || err);
      }
    }

    // Build query — only public-visible listings (listing_status = active)
    let query = supabase.from("listings").select(LISTING_SELECT);
    query = query.eq("listing_status", "active");
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

    // No DB-level ordering: ranking is computed in JS after transform.
    // Single listings round-trip — response time comes from the join
    // (landlords.avg_response_ms), not a per-landlord service-role scan.
    let { data, error } = await query;

    // If query fails (e.g. is_verified not migrated yet), retry with the
    // reduced SELECT that omits it.
    if (error) {
      console.warn("Listings query failed, retrying without verified columns:", error.message);
      let fallbackQuery = supabase.from("listings").select(LISTING_SELECT_FALLBACK);
      fallbackQuery = fallbackQuery.eq("listing_status", "active");
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

      // The fallback SELECT has no is_verified join, so applyListingFilters
      // skips verified_only on this path. Returning the unfiltered rows would
      // silently answer "show me verified listings only" with every listing —
      // a safety claim the data can't back. Fail closed instead: empty result
      // plus an explicit `degraded` marker, so the caller can say "temporarily
      // unavailable" rather than "no matches".
      if (f.verifiedOnly) {
        console.error(
          "verified_only requested but the fallback SELECT cannot honour it — returning empty",
        );
        return NextResponse.json({ listings: [], degraded: true });
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

    // Stay-range: drop blocked calendars + enforce min/max duration fit.
    // SQL already applied available_from / available_to via applyListingFilters.
    if (f.moveInDate && f.moveOutDate) {
      const blocked = new Set(blockedIds);
      const months = stayDurationMonths(f.moveInDate, f.moveOutDate);
      results = results.filter(
        (listing) =>
          !blocked.has(listing.listing_id) &&
          durationFitsListing(listing, months),
      );
    }

    results.sort((a, b) =>
      compareListingsByRank(a, b, { sortBy: f.sortBy, sortOrder: f.sortOrder }),
    );

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
