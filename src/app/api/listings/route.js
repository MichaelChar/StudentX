import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { getSupabaseAsService } from "@/lib/supabaseServer";
import { transformListing, listingCompleteness } from "@/lib/transformListing";
import { getLandlordResponseTime } from "@/lib/landlordResponseTime";
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
} from "@/lib/listingFilters";

const LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  min_duration_months,
  rent!inner ( monthly_price, currency, bills_included, deposit ),
  location!inner ( address, neighborhood, lat, lng ),
  property_types!inner ( name ),
  landlords!inner ( name, is_verified, profile_photo_url ),
  listing_amenities ( amenities ( amenity_id, name ) ),
  faculty_distances ( faculty_id, walk_minutes, transit_minutes, faculties ( name, university ) ),
  listing_university_distances ( university_id, distance_meters, universities ( name, short_name ) )
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

/**
 * Batch average first-response time (ms) per landlord for the listings in
 * the current result set. Reuses getLandlordResponseTime; service role so
 * the public listings route can read inquiries without a landlord JWT.
 */
async function responseTimeByLandlord(listings) {
  const byLandlord = new Map();
  for (const listing of listings) {
    const lid = listing.listing_id?.slice(0, 4);
    if (!lid) continue;
    if (!byLandlord.has(lid)) byLandlord.set(lid, []);
    byLandlord.get(lid).push(listing.listing_id);
  }

  const map = new Map();
  if (byLandlord.size === 0) return map;

  let service;
  try {
    service = getSupabaseAsService();
  } catch {
    // Missing service-role env in some test/dev envs — rank without response time.
    return map;
  }

  await Promise.all(
    [...byLandlord.entries()].map(async ([landlordId, listingIds]) => {
      try {
        const stats = await getLandlordResponseTime(service, listingIds);
        map.set(landlordId, stats.avgMs);
      } catch {
        map.set(landlordId, null);
      }
    }),
  );
  return map;
}

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

    // No DB-level ordering: ranking is computed in JS after transform.
    let { data, error } = await query;

    // If query fails (e.g. is_verified not migrated yet), retry with the
    // reduced SELECT that omits it.
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

    // Ranking keys (highest priority first):
    //   1. landlords.is_verified
    //   2. listing completeness (photos, description, amenities, sqm, floor)
    //   3. landlord response time (faster first; null last)
    // then the student's chosen metric, then newest as tiebreaker.
    const responseMsByLandlord = await responseTimeByLandlord(results);

    const metricValue = (listing) => {
      if (f.sortBy === "price") return listing.monthly_price;
      if (f.sortBy === "walk_minutes") return listing.faculty_distances[0]?.walk_minutes ?? null;
      if (f.sortBy === "transit_minutes") return listing.faculty_distances[0]?.transit_minutes ?? null;
      return null;
    };

    results.sort((a, b) => {
      const aVerified = a.is_verified === true;
      const bVerified = b.is_verified === true;
      if (aVerified !== bVerified) return aVerified ? -1 : 1;

      const aComplete = listingCompleteness(a);
      const bComplete = listingCompleteness(b);
      if (aComplete !== bComplete) return bComplete - aComplete;

      const aLandlord = a.listing_id?.slice(0, 4);
      const bLandlord = b.listing_id?.slice(0, 4);
      const aRt = responseMsByLandlord.get(aLandlord) ?? null;
      const bRt = responseMsByLandlord.get(bLandlord) ?? null;
      if (aRt != null || bRt != null) {
        if (aRt == null) return 1;
        if (bRt == null) return -1;
        if (aRt !== bRt) return aRt - bRt;
      }

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
