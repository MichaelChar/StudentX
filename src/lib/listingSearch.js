import { getSupabase } from '@/lib/supabase';
import { transformListing } from '@/lib/transformListing';
import { compareListingsByRank } from '@/lib/listingRank';
import {
  parseListingFilters,
  resolveRequiredAmenityIds,
  applyListingFilters,
  hasGroundFloorTag,
  hasAllRequiredAmenities,
} from '@/lib/listingFilters';
import { stayDurationMonths, durationFitsListing } from '@/lib/bookingDates';
import { listingIdsBlockedInRange } from '@/lib/bookingBlocks';
import { parseBoundsParams, applyBoundsFilter } from '@/lib/mapBounds';
import { parsePageParam, paginate } from '@/lib/listingPagination';

/*
  The listing search, lifted out of `/api/listings/route.js` (issue #443).

  It moved because it now has TWO callers. The route still owns the HTTP
  contract — status codes, cache headers — and the results page calls this
  directly from its server component so the first page of listings is in the
  HTML a crawler receives. Results were fetched entirely client-side, so
  `curl` on /property/thessaloniki/results returned a grid with no listings
  in it, which made pagination's stated SEO rationale unmeetable.

  Returning `{ status, body }` rather than a Response keeps it usable from a
  server component, where constructing a NextResponse only to read its JSON
  back would be silly. The route re-wraps it in one line.

  The ranking and pagination order is load-bearing and unchanged: filter, then
  rank in JS, THEN slice. A SQL LIMIT/OFFSET would paginate before ranking and
  hand back an arbitrary 18 rows that merely look sorted — see the header
  comment in lib/listingPagination.js.
*/

const LISTING_SELECT = `
  listing_id,
  title,
  description,
  photos,
  floor,
  sqm,
  bedrooms,
  bathrooms,
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

/**
 * Run the public listing search.
 *
 * @param {URLSearchParams} searchParams
 * @returns {Promise<{status: number, body: object}>} `body` is the exact JSON
 *   `/api/listings` returns, so both callers see one shape.
 */
export async function searchListings(searchParams) {
  // Shared (non-budget) filter parsing + validation. Budget is handled inline
  // below — it's the one filter the price-distribution route drops (issue #218).
  const f = parseListingFilters(searchParams);
  if (f.error) {
    return { status: 400, body: { error: f.error } };
  }

  /*
    Map-bounds search (parity Feature 14). Parsed here rather than in
    parseListingFilters because this search is the ONLY consumer — the price
    histogram deliberately describes the whole search, not the current
    viewport (issue #218), so scoping it to the map would make the chart
    disagree with the question it answers.
  */
  const { bounds, error: boundsError } = parseBoundsParams(searchParams);
  if (boundsError) {
    return { status: 400, body: { error: boundsError } };
  }

  const minBudget = searchParams.get('min_budget');
  const maxBudget = searchParams.get('max_budget');

  if (minBudget) {
    const budget = Number(minBudget);
    if (isNaN(budget) || budget <= 0) {
      return { status: 400, body: { error: 'min_budget must be a positive number' } };
    }
  }
  if (maxBudget) {
    const budget = Number(maxBudget);
    if (isNaN(budget) || budget <= 0) {
      return { status: 400, body: { error: 'max_budget must be a positive number' } };
    }
  }

  const supabase = getSupabase();

  // Amenity AND-filter: resolve qualifying listing_ids via SQL RPC
  const {
    listingIds: amenityListingIds,
    failed: amenityRpcFailed,
    empty: amenityEmpty,
  } = await resolveRequiredAmenityIds(supabase, f.excludeAmenities);

  if (amenityEmpty) {
    return { status: 200, body: { listings: [] } };
  }

  // Stay-range search: listing ids with overlapping pending/booked holds.
  // Filtered in JS after transform (avoids PostgREST not.in quoting quirks).
  let blockedIds = [];
  if (f.moveInDate && f.moveOutDate) {
    try {
      blockedIds = await listingIdsBlockedInRange(f.moveInDate, f.moveOutDate);
    } catch (err) {
      console.warn('listingIdsBlockedInRange failed:', err?.message || err);
    }
  }

  // Build query — only public-visible listings (listing_status = active)
  let query = supabase.from('listings').select(LISTING_SELECT);
  query = query.eq('listing_status', 'active');
  query = applyListingFilters(query, f, { amenityListingIds });
  query = applyBoundsFilter(query, bounds);
  if (minBudget) query = query.gte('rent.monthly_price', Number(minBudget));
  if (maxBudget) query = query.lte('rent.monthly_price', Number(maxBudget));

  // No DB-level ordering: ranking is computed in JS after transform.
  // Single listings round-trip — response time comes from the join
  // (landlords.avg_response_ms), not a per-landlord service-role scan.
  let { data, error } = await query;

  // If query fails (e.g. is_verified not migrated yet), retry with the
  // reduced SELECT that omits it.
  if (error) {
    console.warn('Listings query failed, retrying without verified columns:', error.message);
    let fallbackQuery = supabase.from('listings').select(LISTING_SELECT_FALLBACK);
    fallbackQuery = fallbackQuery.eq('listing_status', 'active');
    fallbackQuery = applyListingFilters(fallbackQuery, f, { fallback: true, amenityListingIds });
    // The fallback SELECT keeps the `location!inner` join, so bounds are
    // honoured on this path too — unlike verified_only, which cannot be.
    fallbackQuery = applyBoundsFilter(fallbackQuery, bounds);
    if (minBudget) fallbackQuery = fallbackQuery.gte('rent.monthly_price', Number(minBudget));
    if (maxBudget) fallbackQuery = fallbackQuery.lte('rent.monthly_price', Number(maxBudget));

    const fallbackResult = await fallbackQuery;
    if (fallbackResult.error) {
      console.error('Supabase fallback query error:', fallbackResult.error);
      return { status: 500, body: { error: 'Failed to fetch listings' } };
    }

    // The fallback SELECT has no is_verified join, so applyListingFilters
    // skips verified_only on this path. Returning the unfiltered rows would
    // silently answer "show me verified listings only" with every listing —
    // a safety claim the data can't back. Fail closed instead: empty result
    // plus an explicit `degraded` marker, so the caller can say "temporarily
    // unavailable" rather than "no matches".
    if (f.verifiedOnly) {
      console.error(
        'verified_only requested but the fallback SELECT cannot honour it — returning empty',
      );
      return { status: 200, body: { listings: [], degraded: true } };
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
    const required = f.excludeAmenities.split(',').map((a) => a.trim());
    results = results.filter((listing) => hasAllRequiredAmenities(listing.amenities, required));
  }

  // Stay-range: drop blocked calendars + enforce min/max duration fit.
  // SQL already applied available_from / available_to via applyListingFilters.
  if (f.moveInDate && f.moveOutDate) {
    const blocked = new Set(blockedIds);
    const months = stayDurationMonths(f.moveInDate, f.moveOutDate);
    results = results.filter(
      (listing) =>
        !blocked.has(listing.listing_id) && durationFitsListing(listing, months),
    );
  }

  /*
    Commute filter (S15) — "within N minutes' walk of my faculty".

    Filtered HERE in JS, not in SQL, because `faculty_distances` is a plain
    embed rather than an `!inner` join: a PostgREST filter on an embedded
    column narrows the embedded ROWS, it does not exclude the parent listing.
    That is exactly what `?faculty=` wants (it scopes which distance is shown,
    and deliberately hides nothing), but it is the opposite of what a max-walk
    filter wants. Switching the embed to `!inner` would silently change
    `?faculty=` from scoping to excluding, so the narrow fix stays here — the
    same reasoning as the ground-floor tag check above.

    Runs BEFORE the sort and the pagination slice, so page 1 is the top ranked
    matches and `total` counts matches rather than candidates.

    `f.faculty` is guaranteed present — parseListingFilters rejects
    max_walk_minutes without it — so the scoped embed holds at most the one
    faculty, and a listing with no row for it is correctly excluded.
  */
  if (f.maxWalkMinutes !== null) {
    results = results.filter((listing) =>
      (listing.faculty_distances ?? []).some(
        (fd) =>
          fd.faculty_id === f.faculty &&
          typeof fd.walk_minutes === 'number' &&
          fd.walk_minutes <= f.maxWalkMinutes,
      ),
    );
  }

  results.sort((a, b) =>
    compareListingsByRank(a, b, { sortBy: f.sortBy, sortOrder: f.sortOrder }),
  );

  /*
    Numbered pagination (parity Feature 15).

    OPT-IN, not default-on: this search has two other consumers —
    DirectoryCarousel (takes the head of the directory) and the
    synthetic-en-listing canary — and silently capping them at 18 to serve the
    results grid would be a behaviour change they never asked for. Only a
    caller that sends `page` gets a page.
  */
  const pageParam = searchParams.get('page');
  if (pageParam !== null) {
    const paged = paginate(results, parsePageParam(pageParam));
    return {
      status: 200,
      body: {
        listings: paged.items,
        page: paged.page,
        per_page: paged.perPage,
        total: paged.total,
        total_pages: paged.totalPages,
      },
    };
  }

  return { status: 200, body: { listings: results } };
}
