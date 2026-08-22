import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  listingCountNeedsRowFetch,
  applyListingFilterResiduals,
} from "@/lib/listingFilters";
import { listingIdsBlockedInRange } from "@/lib/bookingBlocks";

/**
 * Filter-aware listing count for the Filters modal's sticky `Show N places`
 * CTA (parity Feature 9 / S7).
 *
 * Mirrors /api/listings/price-distribution — same parseListingFilters /
 * applyListingFilters / amenity RPC / pre-migration fallback SELECT — so the
 * count cannot drift from the list on what a filter *means*. The ONE
 * deliberate divergence from that sibling is budget: price-distribution
 * ignores min_budget/max_budget so the histogram can keep above-budget
 * listings visible behind the marker (issue #218). This route MUST apply
 * them. `Show N places` has to match what /api/listings will actually return
 * for the same query string, not what the histogram plots.
 *
 * Do not overload /api/listings/count. That endpoint is the unfiltered
 * landing-page total (no listing_status clause, no filters) and other
 * callers depend on that shape.
 *
 * Response is `{ count }` only — no rows, no listing payload. When every
 * active filter is expressible in PostgREST we use `{ count: 'exact',
 * head: true }` so Postgres returns no body. Some filters in this codebase
 * are JS residuals after the fetch (ground-floor amenity tag, amenity-RPC
 * fallback, stay-range blocked calendars + duration fit). Those force a
 * lean-row fetch + in-memory count, matching /api/listings. Dropping a
 * residual to keep the query cheap would make N disagree with the list,
 * which is worse than a slower N.
 */

// Lean SELECT: only the joins the shared filters touch, plus the columns the
// JS residuals read (listing_id, min/max duration, amenity names). No photos /
// description / address / contact — far lighter than /api/listings.
const COUNT_SELECT = `
  listing_id,
  min_duration_months,
  max_duration_months,
  rent!inner ( monthly_price, bills_included ),
  location!inner ( neighborhood ),
  property_types!inner ( name ),
  landlords!inner ( is_verified ),
  faculty_distances ( faculty_id ),
  listing_amenities ( amenities ( name ) )
`;

// Fallback SELECT without is_verified for pre-migration compat
// (mirrors /api/listings' fallback — verified_only is skipped on this path).
// min/max duration are omitted too, matching LISTING_SELECT_FALLBACK, so a
// stay-range duration-fit residual is a no-op here the same way it is on the
// list's fallback path (transformListing would see null min/max).
const COUNT_SELECT_FALLBACK = `
  listing_id,
  rent!inner ( monthly_price, bills_included ),
  location!inner ( neighborhood ),
  property_types!inner ( name ),
  landlords!inner ( name ),
  faculty_distances ( faculty_id ),
  listing_amenities ( amenities ( name ) )
`;

function countResponse(count) {
  const response = NextResponse.json({ count });
  // Cacheable per filter-combo at the edge — one cached response per distinct
  // query string, same posture as price-distribution. s-maxage matches that
  // sibling; stale-while-revalidate matches /api/listings/count (and the
  // Feature 9 spec), which is the longer of the two public count caches.
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=86400",
  );
  return response;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Same non-budget filter parsing/validation as /api/listings.
    const f = parseListingFilters(searchParams);
    if (f.error) {
      return NextResponse.json({ error: f.error }, { status: 400 });
    }

    // Budget IS applied here — unlike price-distribution. Copied lockstep
    // from /api/listings (positive-number check, same error strings) so the
    // two cannot 400 on different inputs.
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
      return countResponse(0);
    }

    // Stay-range search: listing ids with overlapping pending/booked holds.
    // Filtered in JS after the fetch (avoids PostgREST not.in quoting quirks),
    // same as /api/listings.
    let blockedIds = [];
    if (f.moveInDate && f.moveOutDate) {
      try {
        blockedIds = await listingIdsBlockedInRange(f.moveInDate, f.moveOutDate);
      } catch (err) {
        console.warn("listingIdsBlockedInRange failed:", err?.message || err);
      }
    }

    const needsRows = listingCountNeedsRowFetch(f, amenityRpcFailed);

    function attachFilters(query, { fallback = false } = {}) {
      query = query.eq("listing_status", "active");
      query = applyListingFilters(query, f, { fallback, amenityListingIds });
      if (minBudget) {
        query = query.gte("rent.monthly_price", Number(minBudget));
      }
      if (maxBudget) {
        query = query.lte("rent.monthly_price", Number(maxBudget));
      }
      return query;
    }

    // Validate budget before hitting the DB — same rules as /api/listings.
    if (minBudget) {
      const budget = Number(minBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "min_budget must be a positive number" },
          { status: 400 },
        );
      }
    }
    if (maxBudget) {
      const budget = Number(maxBudget);
      if (isNaN(budget) || budget <= 0) {
        return NextResponse.json(
          { error: "max_budget must be a positive number" },
          { status: 400 },
        );
      }
    }

    let query = needsRows
      ? supabase.from("listings").select(COUNT_SELECT)
      : supabase.from("listings").select(COUNT_SELECT, { count: "exact", head: true });
    query = attachFilters(query);

    let { data, count, error } = await query;

    // Retry without verified columns if they aren't migrated yet (mirrors
    // /api/listings — verified_only is dropped on the fallback path).
    if (error) {
      console.warn(
        "count-filtered query failed, retrying without is_verified:",
        error.message,
      );
      let fallbackQuery = needsRows
        ? supabase.from("listings").select(COUNT_SELECT_FALLBACK)
        : supabase.from("listings").select(COUNT_SELECT_FALLBACK, {
            count: "exact",
            head: true,
          });
      fallbackQuery = attachFilters(fallbackQuery, { fallback: true });
      const fallbackResult = await fallbackQuery;
      if (fallbackResult.error) {
        console.error("count-filtered fallback query error:", fallbackResult.error);
        return NextResponse.json(
          { error: "Failed to fetch listing count" },
          { status: 500 },
        );
      }

      // The fallback SELECT has no is_verified join, so applyListingFilters
      // skips verified_only on this path. Returning the unfiltered count would
      // silently answer "show me verified listings only" with every listing —
      // a safety claim the data can't back. Fail closed, matching /api/listings
      // (which returns `{ listings: [], degraded: true }`). Body stays
      // `{ count }` only; we skip the edge cache so a half-migrated blip
      // doesn't stick `Show 0 places` on the CTA for a day.
      if (f.verifiedOnly) {
        console.error(
          "verified_only requested but the fallback SELECT cannot honour it — returning empty",
        );
        return NextResponse.json({ count: 0 });
      }

      data = fallbackResult.data;
      count = fallbackResult.count;
    }

    if (!needsRows) {
      return countResponse(count ?? 0);
    }

    // Residual JS filters, mirroring /api/listings, so N matches the list.
    // On the fallback SELECT, min/max duration columns are absent — duration
    // fit becomes a no-op, same as the list's fallback path.
    const rows = applyListingFilterResiduals(data || [], f, {
      amenityRpcFailed,
      blockedIds,
    });
    return countResponse(rows.length);
  } catch (err) {
    console.error("Unexpected error in GET /api/listings/count-filtered:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
