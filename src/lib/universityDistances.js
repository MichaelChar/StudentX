import { DEFAULT_CITY } from '@/lib/cityRoutes';

/**
 * Landlord-authored "metres from this listing to each university" (migration 066).
 *
 * The number is entirely self-reported: there is no prefill, no auto-compute
 * from the map pin, and no cross-check against one. Validation here is sanity
 * bounds only — a wrong-but-plausible number is the landlord's to own. The
 * public UI labels it as landlord-listed rather than platform-measured.
 *
 * Not to be confused with `faculty_distances`, which is OSRM-computed walk /
 * transit MINUTES per faculty and is service-role-write-only (migrations 050,
 * 055). Different granularity, unit, and provenance — see the migration header.
 */

// Ceiling is a typo guard (metres/kilometres mix-up, stray zero), not a claim
// about plausibility. Mirrors the CHECK constraint in migration 066 so the API
// returns a 400 instead of letting Postgres raise a 500.
export const MAX_DISTANCE_METERS = 50000;

/**
 * Look up the university ids valid for a city.
 *
 * Listings carry no city column — the directory is single-city today (see
 * SUPPORTED_CITIES / DEFAULT_CITY in cityRoutes.js), so every listing is
 * Thessaloniki. Taking the city as a parameter means the multi-city switch is
 * a caller change, not a rewrite of this module.
 *
 * @returns {Promise<Set<string>|null>} valid ids, or null if the lookup failed
 *   (e.g. migration 066 not yet applied — callers treat that as "skip", not
 *   "reject", so distances degrade to absent rather than blocking a save).
 */
export async function getCityUniversityIds(supabase, citySlug = DEFAULT_CITY) {
  const { data, error } = await supabase
    .from('universities')
    .select('university_id')
    .eq('city_slug', citySlug);

  if (error || !data) return null;
  return new Set(data.map((u) => u.university_id));
}

/**
 * Parse + validate the `university_distances` payload from a landlord write.
 *
 * @param {unknown} input - expected `[{ university_id, distance_meters }]`
 * @param {Set<string>} validIds - ids from getCityUniversityIds
 * @returns {{ rows: Array<{university_id: string, distance_meters: number}> } | { error: string }}
 */
export function parseUniversityDistances(input, validIds) {
  if (!Array.isArray(input)) {
    return { error: 'university_distances must be an array' };
  }

  const rows = [];
  const seen = new Set();

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      return { error: 'each university_distances entry must be an object' };
    }

    const { university_id: universityId } = entry;
    if (typeof universityId !== 'string' || !validIds.has(universityId)) {
      return { error: `unknown university_id: ${universityId}` };
    }
    if (seen.has(universityId)) {
      return { error: `duplicate university_id: ${universityId}` };
    }

    // Accept the string the number input hands us, reject anything that isn't
    // a clean integer ("1200.5", "1e3", "abc", NaN, Infinity).
    const raw = entry.distance_meters;
    const meters = typeof raw === 'string' ? Number(raw.trim()) : raw;
    if (
      typeof meters !== 'number' ||
      !Number.isInteger(meters) ||
      meters <= 0 ||
      meters > MAX_DISTANCE_METERS
    ) {
      return {
        error: `distance_meters for ${universityId} must be a whole number between 1 and ${MAX_DISTANCE_METERS}`,
      };
    }

    seen.add(universityId);
    rows.push({ university_id: universityId, distance_meters: meters });
  }

  return { rows };
}

/**
 * Replace a listing's distance rows wholesale (delete-then-insert), matching
 * how `listing_amenities` is written by the same routes.
 *
 * `supabase` MUST be token-scoped — the RLS policy from migration 066 is what
 * enforces that the caller owns this listing.
 *
 * Non-fatal by contract: returns an error string rather than throwing, and
 * callers log-and-continue. An optional field must never fail a listing
 * create/edit, which is the same rule the inline faculty-distance recompute
 * already follows in these routes.
 *
 * @returns {Promise<{ error: string|null }>}
 */
export async function writeUniversityDistances(supabase, listingId, rows) {
  const { error: deleteError } = await supabase
    .from('listing_university_distances')
    .delete()
    .eq('listing_id', listingId);

  if (deleteError) return { error: deleteError.message };
  if (rows.length === 0) return { error: null };

  const { error: insertError } = await supabase
    .from('listing_university_distances')
    .insert(rows.map((r) => ({ ...r, listing_id: listingId })));

  return { error: insertError ? insertError.message : null };
}
