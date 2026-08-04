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
 * True when a wizard row already has a positive numeric distance the landlord
 * (or a prior prefill) filled in. Empty string / whitespace / 0 / NaN do not count.
 *
 * @param {unknown} distanceMeters
 * @returns {boolean}
 */
export function hasFilledDistance(distanceMeters) {
  if (distanceMeters == null || distanceMeters === '') return false;
  const raw =
    typeof distanceMeters === 'string' ? distanceMeters.trim() : distanceMeters;
  if (raw === '') return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0;
}

/**
 * Merge pin-computed distances into existing wizard rows.
 *
 * Rules (matches the wizard comment "keep landlord-adjusted; fill missing /
 * replace pure empty"):
 * - Landlord rows with a real distance are preserved as-is.
 * - Empty rows (including ones "+ Add university" creates with source=landlord
 *   and distance '') are filled from the pin when a value exists.
 * - source=computed rows are refreshed from the pin.
 * - Empty form → nearest computed universities up to maxRows.
 * - Non-empty form → existing row order is kept; remaining computed unis not
 *   yet listed are appended up to maxRows.
 *
 * @param {Array<{ university_id?: string, distance_meters?: unknown, source?: string }>} existing
 * @param {Array<{ university_id: string, distance_meters: number }>} computedDistances
 * @param {number} [maxRows=3]
 * @returns {Array<{ university_id: string, distance_meters: string, source: string }>}
 */
export function mergePrefillUniversityDistances(
  existing,
  computedDistances,
  maxRows = 3,
) {
  const cap =
    typeof maxRows === 'number' && maxRows > 0 ? Math.floor(maxRows) : 3;
  const computed = Array.isArray(computedDistances) ? computedDistances : [];
  const computedById = new Map();
  for (const d of computed) {
    if (!d?.university_id) continue;
    const meters = Number(d.distance_meters);
    if (!Number.isFinite(meters) || meters <= 0) continue;
    computedById.set(d.university_id, Math.round(meters));
  }

  const asComputedRow = (universityId) => {
    const meters = computedById.get(universityId);
    if (meters == null) return null;
    return {
      university_id: universityId,
      distance_meters: String(meters),
      source: 'computed',
    };
  };

  const rows = Array.isArray(existing) ? existing : [];

  // First entry / cleared form: nearest campuses from the pin.
  if (rows.length === 0) {
    const out = [];
    for (const d of computed) {
      if (out.length >= cap) break;
      const row = asComputedRow(d.university_id);
      if (row) out.push(row);
    }
    return out;
  }

  const usedIds = new Set();
  const next = [];

  for (const row of rows) {
    const id = row?.university_id;
    if (typeof id !== 'string' || !id || usedIds.has(id)) continue;
    usedIds.add(id);

    // Real landlord edit — do not overwrite with the pin.
    if (row.source === 'landlord' && hasFilledDistance(row.distance_meters)) {
      next.push({
        university_id: id,
        distance_meters: String(row.distance_meters).trim(),
        source: 'landlord',
      });
      continue;
    }

    const filled = asComputedRow(id);
    if (filled) {
      next.push(filled);
      continue;
    }

    // No pin value for this id: keep a filled distance if we have one, else an
    // empty shell the landlord can type into.
    if (hasFilledDistance(row.distance_meters)) {
      next.push({
        university_id: id,
        distance_meters: String(row.distance_meters).trim(),
        source: row.source === 'computed' ? 'computed' : 'landlord',
      });
    } else {
      next.push({
        university_id: id,
        distance_meters: '',
        source: 'landlord',
      });
    }
  }

  // Append any remaining nearest unis not already listed (up to cap).
  for (const d of computed) {
    if (next.length >= cap) break;
    if (usedIds.has(d.university_id)) continue;
    const row = asComputedRow(d.university_id);
    if (!row) continue;
    usedIds.add(d.university_id);
    next.push(row);
  }

  return next;
}

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
