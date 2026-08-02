import { DEFAULT_CITY } from '@/lib/cityRoutes';

/**
 * Landlord-authored "metres from this listing to each university" (migration 066).
 *
 * The wizard prefills from the map pin (source = 'computed') and lets the
 * landlord adjust (source flips to 'landlord'). Distance values are still
 * stored as self-reported metres — faculty_distances remains the OSRM
 * walk/transit-minute table and is service-role-write-only.
 */

// Ceiling is a typo guard (metres/kilometres mix-up, stray zero), not a claim
// about plausibility. Mirrors the CHECK constraint in migration 066 so the API
// returns a 400 instead of letting Postgres raise a 500.
export const MAX_DISTANCE_METERS = 50000;

/** Marketplace rule: at least two universities on a submitted listing. */
export const MIN_UNIVERSITY_DISTANCES = 2;

const ALLOWED_SOURCES = new Set(['computed', 'landlord']);

/**
 * Look up the university ids valid for a city.
 *
 * @returns {Promise<Set<string>|null>} valid ids, or null if the lookup failed
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
 * @param {unknown} input - expected `[{ university_id, distance_meters, source? }]`
 * @param {Set<string>} validIds - ids from getCityUniversityIds
 * @param {{ requireMin?: number }} [opts]
 * @returns {{ rows: Array<{university_id: string, distance_meters: number, source: string}> } | { error: string }}
 */
export function parseUniversityDistances(input, validIds, opts = {}) {
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

    let source = entry.source;
    if (source == null || source === '') {
      source = 'landlord';
    } else if (typeof source !== 'string' || !ALLOWED_SOURCES.has(source)) {
      return {
        error: `source for ${universityId} must be 'computed' or 'landlord'`,
      };
    }

    seen.add(universityId);
    rows.push({
      university_id: universityId,
      distance_meters: meters,
      source,
    });
  }

  const requireMin = opts.requireMin;
  if (typeof requireMin === 'number' && rows.length < requireMin) {
    return {
      error: `university_distances requires at least ${requireMin} entries`,
    };
  }

  return { rows };
}

/**
 * Replace a listing's distance rows wholesale (delete-then-insert).
 *
 * Writes listing_id, university_id, distance_meters, and source
 * ('computed' from map-pin prefill, 'landlord' when typed/edited).
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
    .insert(
      rows.map((r) => ({
        listing_id: listingId,
        university_id: r.university_id,
        distance_meters: r.distance_meters,
        source: r.source === 'computed' ? 'computed' : 'landlord',
      })),
    );

  return { error: insertError ? insertError.message : null };
}
