import { stayDurationMonths, durationFitsListing } from "@/lib/bookingDates";

/**
 * Shared listing-filter logic for /api/listings,
 * /api/listings/price-distribution, and /api/listings/count-filtered.
 *
 * All three honour an identical filter set (faculty, types, neighborhoods,
 * exclude_amenities, verified_only, min_duration, exclude_ground_floor,
 * require_bills_included, available_from, move_in/move_out). The ONE
 * intentional divergence is budget: /api/listings and
 * /api/listings/count-filtered apply min_budget/max_budget inline (those
 * clauses live in the routes, not here), while the price-distribution route
 * drops them so the histogram keeps above-budget supply visible behind the
 * budget marker (issue #218). count-filtered MUST apply budget — `Show N
 * places` has to match the list the student will see, not the histogram.
 *
 * Keeping the parse/validate/RPC/where-clause/residual logic here means the
 * routes can never drift on what a filter means.
 */

const ALLOWED_MIN_DURATIONS = [1, 5, 9];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a real YYYY-MM-DD calendar date (rejects 2026-02-31 rollovers).
 */
function parseValidDate(value) {
  if (!value) return { date: null };
  const isShape = DATE_RE.test(value);
  const parsed = isShape ? new Date(`${value}T00:00:00Z`) : new Date("invalid");
  const roundTrips =
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  if (!isShape || !roundTrips) {
    return { error: true };
  }
  return { date: value };
}

/**
 * Parse + validate every shared (non-budget) filter param from a
 * URLSearchParams. Returns `{ error: string }` on the first validation failure
 * (the caller turns that into a 400), otherwise a normalized filter object.
 *
 * Budget is intentionally NOT handled here — /api/listings reads and validates
 * min_budget/max_budget itself, and the distribution route ignores them.
 *
 * move_in + move_out (optional pair): stay range for availability search.
 * When both are set, the listings route also excludes blocked calendars and
 * enforces min/max duration fit (see /api/listings).
 */
export function parseListingFilters(searchParams) {
  const faculty = searchParams.get("faculty");
  const types = searchParams.get("types");
  const neighborhoods = searchParams.get("neighborhoods");
  const excludeAmenities = searchParams.get("exclude_amenities");
  const sortBy = searchParams.get("sort_by") || "price";
  const sortOrder = searchParams.get("sort_order") || "asc";
  const verifiedOnly = searchParams.get("verified_only") === "true";
  const minDuration = searchParams.get("min_duration");
  const excludeGroundFloor = searchParams.get("exclude_ground_floor") === "true";
  const requireBillsIncluded = searchParams.get("require_bills_included") === "true";
  const availableFrom = searchParams.get("available_from");
  const moveIn = searchParams.get("move_in");
  const moveOut = searchParams.get("move_out");

  // Validate min_duration: must be 1, 5, or 9 (or absent)
  let minDurationN = null;
  if (minDuration) {
    const n = Number(minDuration);
    if (!ALLOWED_MIN_DURATIONS.includes(n)) {
      return { error: "min_duration must be 1, 5, or 9" };
    }
    minDurationN = n;
  }

  // Validate available_from: must be a real YYYY-MM-DD date (or absent).
  // Rejects bad shapes and impossible dates (e.g. 2026-02-31, which JS would
  // otherwise roll over to March).
  let availableFromDate = null;
  if (availableFrom) {
    const r = parseValidDate(availableFrom);
    if (r.error) {
      return { error: "available_from must be a valid date in YYYY-MM-DD format" };
    }
    availableFromDate = r.date;
  }

  // move_in / move_out stay range (both or neither for a complete pair).
  let moveInDate = null;
  let moveOutDate = null;
  if (moveIn || moveOut) {
    if (!moveIn || !moveOut) {
      return { error: "move_in and move_out must both be provided" };
    }
    const inR = parseValidDate(moveIn);
    if (inR.error) {
      return { error: "move_in must be a valid date in YYYY-MM-DD format" };
    }
    const outR = parseValidDate(moveOut);
    if (outR.error) {
      return { error: "move_out must be a valid date in YYYY-MM-DD format" };
    }
    if (outR.date <= inR.date) {
      return { error: "move_out must be after move_in" };
    }
    moveInDate = inR.date;
    moveOutDate = outR.date;
  }

  // Validate sort params
  const validSortBy = ["price", "walk_minutes", "transit_minutes"];
  if (!validSortBy.includes(sortBy)) {
    return { error: `sort_by must be one of: ${validSortBy.join(", ")}` };
  }
  if (sortOrder !== "asc" && sortOrder !== "desc") {
    return { error: "sort_order must be 'asc' or 'desc'" };
  }
  if ((sortBy === "walk_minutes" || sortBy === "transit_minutes") && !faculty) {
    return { error: `sort_by '${sortBy}' requires a faculty param` };
  }
  if (faculty && !/^[a-z0-9-]+$/.test(faculty)) {
    return { error: "faculty must be a valid faculty ID (e.g. 'auth-main')" };
  }
  if (types !== null && types.trim() === "") {
    return { error: "types must be a non-empty comma-separated list of property type names" };
  }
  if (excludeAmenities !== null && excludeAmenities.trim() === "") {
    return { error: "exclude_amenities must be a non-empty comma-separated list" };
  }

  return {
    faculty,
    types,
    neighborhoods,
    excludeAmenities,
    sortBy,
    sortOrder,
    verifiedOnly,
    minDurationN,
    excludeGroundFloor,
    requireBillsIncluded,
    availableFromDate,
    moveInDate,
    moveOutDate,
  };
}

/**
 * Resolve the exclude_amenities AND-filter to a set of qualifying listing ids
 * via the `listings_with_all_amenities` SQL RPC.
 *
 * @returns {Promise<{ listingIds: string[]|null, failed: boolean, empty: boolean }>}
 *   - `listingIds` — ids to constrain the query to (null = no constraint).
 *   - `failed` — RPC unavailable; caller should fall back to a JS amenity check.
 *   - `empty` — RPC succeeded but matched zero listings; caller should
 *     short-circuit to an empty response.
 */
export async function resolveRequiredAmenityIds(supabase, excludeAmenities) {
  if (!excludeAmenities) {
    return { listingIds: null, failed: false, empty: false };
  }
  const required = excludeAmenities.split(",").map((a) => a.trim());
  const { data: rows, error } = await supabase
    .rpc("listings_with_all_amenities", { p_amenity_names: required });

  if (error) {
    console.warn("listings_with_all_amenities RPC unavailable, falling back to JS:", error.message);
    return { listingIds: null, failed: true, empty: false };
  }
  if (!rows || rows.length === 0) {
    return { listingIds: null, failed: false, empty: true };
  }
  return { listingIds: rows.map((r) => r.listing_id), failed: false, empty: false };
}

/**
 * Apply the shared WHERE clauses to a Supabase query builder and return it.
 * Budget is NOT applied here (see module docstring).
 *
 * @param query   a Supabase PostgREST query builder
 * @param f       a normalized filter object from {@link parseListingFilters}
 * @param opts
 * @param opts.fallback           when true, skip the clauses the fallback
 *   SELECT can't support — verified_only (no is_verified join) and
 *   min_duration — mirroring the original /api/listings fallback path exactly.
 * @param opts.amenityListingIds  ids from {@link resolveRequiredAmenityIds}.
 */
export function applyListingFilters(query, f, { fallback = false, amenityListingIds = null } = {}) {
  if (amenityListingIds) {
    query = query.in("listing_id", amenityListingIds);
  }

  // Neighborhoods (comma-separated)
  if (f.neighborhoods) {
    const neighborhoodList = f.neighborhoods.split(",").map((n) => n.trim()).filter(Boolean);
    if (neighborhoodList.length > 0) {
      query = query.in("location.neighborhood", neighborhoodList);
    }
  }

  // Property types (comma-separated)
  if (f.types) {
    query = query.in("property_types.name", f.types.split(",").map((t) => t.trim()));
  }

  // Faculty distances scoped to the selected faculty only
  if (f.faculty) {
    query = query.eq("faculty_distances.faculty_id", f.faculty);
  }

  // Minimum-duration commitment: listings whose min_duration_months <= N.
  // Skipped on the fallback path (mirrors the original route).
  if (!fallback && f.minDurationN !== null) {
    query = query.lte("min_duration_months", f.minDurationN);
  }

  // Verified landlords only — free admin-approved ID verification.
  // Skipped on the fallback path (the is_verified join is what triggered it).
  if (!fallback && f.verifiedOnly) {
    query = query.eq("landlords.is_verified", true);
  }

  // Bills included
  if (f.requireBillsIncluded) {
    query = query.eq("rent.bills_included", true);
  }

  // Exclude ground-floor units (SQL half — the `floor != 0` check). The
  // complementary "ground floor" amenity-tag check stays in JS post-fetch.
  // NULL floors are kept (`WHERE floor != 0` would drop them).
  if (f.excludeGroundFloor) {
    query = query.or("floor.is.null,floor.neq.0");
  }

  // Available on or before the chosen move-in date (NULL = always available).
  // When move_in is set (stay search), it supersedes available_from for the
  // lower bound so we don't double-filter on conflicting dates.
  const coverFrom = f.moveInDate || f.availableFromDate;
  if (coverFrom) {
    query = query.or(`available_from.is.null,available_from.lte.${coverFrom}`);
  }

  // Stay search: listing must remain available through move_out (NULL = open).
  if (f.moveOutDate) {
    query = query.or(`available_to.is.null,available_to.gte.${f.moveOutDate}`);
  }

  return query;
}

/**
 * Whether a listing carries the "ground floor" amenity tag — the JS residual
 * for the exclude_ground_floor filter (the `floor != 0` half is pushed to SQL).
 */
export function hasGroundFloorTag(amenityNames) {
  return (amenityNames || []).some((a) => String(a).toLowerCase() === "ground floor");
}

/**
 * Whether a listing has ALL required amenities — the JS fallback for
 * exclude_amenities when the SQL RPC is unavailable. Case-insensitive.
 */
export function hasAllRequiredAmenities(amenityNames, required) {
  const have = (amenityNames || []).map((a) => String(a).toLowerCase());
  return (required || []).every((r) => have.includes(String(r).toLowerCase()));
}

/**
 * Amenity names off a raw PostgREST row. Guards the to-one embed arriving as
 * an object OR a one-element array (same shape price-distribution already
 * defends against). Used by the JS residuals so count-filtered never has to
 * run transformListing just to read a name.
 */
export function amenityNamesOf(row) {
  return (row?.listing_amenities || [])
    .map((la) => {
      const a = Array.isArray(la.amenities) ? la.amenities[0] : la.amenities;
      return a?.name;
    })
    .filter(Boolean);
}

/**
 * Whether the shared JS residuals will run after the query. When true, a
 * `{ count: 'exact', head: true }` query cannot produce the same N as
 * /api/listings — we have to fetch the lean rows and count in JS.
 *
 * Query-side filters (neighborhoods, types, faculty, min_duration,
 * verified_only, bills, floor != 0, availability window, amenity-RPC ids,
 * budget) do NOT trip this. Only the residuals that /api/listings itself
 * cannot push into PostgREST:
 *   - exclude_ground_floor amenity-tag check (SQL already dropped floor = 0)
 *   - exclude_amenities when the SQL RPC is down
 *   - stay-range blocked calendars + min/max duration fit
 */
export function listingCountNeedsRowFetch(f, amenityRpcFailed = false) {
  return Boolean(
    f.excludeGroundFloor ||
      amenityRpcFailed ||
      (f.moveInDate && f.moveOutDate),
  );
}

/**
 * Apply the JS residuals /api/listings runs after transformListing, but on
 * raw PostgREST rows (count-filtered never fetches the full listing payload).
 *
 * Kept here — not inlined in the route — so a later listings refactor can
 * call the same function and the count cannot silently diverge.
 */
export function applyListingFilterResiduals(
  rows,
  f,
  { amenityRpcFailed = false, blockedIds = [] } = {},
) {
  let out = rows || [];
  if (f.excludeGroundFloor) {
    out = out.filter((row) => !hasGroundFloorTag(amenityNamesOf(row)));
  }
  if (f.excludeAmenities && amenityRpcFailed) {
    const required = f.excludeAmenities.split(",").map((a) => a.trim());
    out = out.filter((row) => hasAllRequiredAmenities(amenityNamesOf(row), required));
  }
  if (f.moveInDate && f.moveOutDate) {
    const blocked = new Set(blockedIds);
    const months = stayDurationMonths(f.moveInDate, f.moveOutDate);
    out = out.filter(
      (row) => !blocked.has(row.listing_id) && durationFitsListing(row, months),
    );
  }
  return out;
}
