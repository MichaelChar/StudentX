/**
 * Keeping a listing's distances in step with its map pin.
 *
 * Both distance tables are measured from `location.lat/lng`, and neither
 * noticed the pin moving:
 *
 *   - `faculty_distances` is filled by recomputeMissingDistances, which only
 *     fills MISSING pairs. After a move no pair is missing, so the old walk
 *     times stayed forever.
 *   - `listing_university_distances` is re-measured by the wizard only when
 *     the landlord opens the universities step. The form sends its stored rows
 *     back on every save, so moving the pin in the address step and saving
 *     rewrote the OLD distances.
 *
 * The PATCH route is the only writer that changes an existing listing's
 * coordinates, so it detects the move (coordsChanged), deletes the walk-time
 * rows at once (a gap is better than a wrong number; the daily cron is the
 * backstop), and re-measures both tables after the response from ONE router
 * call (refreshDistancesFromPin).
 */

import { coordsChanged } from '@/lib/coordsChanged';
import { computeUniversityDistances, measurePin } from '@/lib/computeUniversityDistances';
import { distanceToMinutes } from '@/lib/recomputeDistances';
import {
  MIN_UNIVERSITY_DISTANCES,
  writeUniversityDistances,
} from '@/lib/universityDistances';

export { coordsChanged };

/**
 * Re-measure a listing's university distances from its (new) pin and replace
 * the stored rows. The same measurement the wizard's universities step makes.
 *
 * Keeps the existing rows when too few universities come back to satisfy the
 * go-live rule (e.g. the faculties read failed). Replacing them with a short
 * list would make a live listing fail MIN_UNIVERSITY_DISTANCES on its next
 * submit. OSRM being down does NOT hit that case, because
 * computeUniversityDistances falls back to straight-line distances.
 *
 * @param {{ supabase: object, listingId: string, lat: number, lng: number, computeImpl?: typeof computeUniversityDistances }} args
 *   `supabase` must be able to write listing_university_distances (service role).
 */
export async function remeasureUniversityDistances({
  supabase,
  listingId,
  lat,
  lng,
  computeImpl = computeUniversityDistances,
}) {
  const targets = await loadMeasureTargets(supabase, '[remeasureUniversityDistances]');
  if (targets.error) return { ok: false, reason: targets.error };

  const measured = await computeImpl({ lat, lng }, targets.faculties, {
    universities: targets.universities,
  });
  return writeMeasuredUniversities(supabase, listingId, measured, { lat, lng });
}

/**
 * Re-measure BOTH distance tables for a moved pin from a single router call
 * (measurePin). This is what the PATCH route runs after a pin move.
 *
 * University rows follow remeasureUniversityDistances' rules (kept if too few
 * come back). Walk times are upserted for every faculty the router reached,
 * stamped (migration 126). A faculty it didn't reach stays missing for the
 * recompute-distances cron: never a straight-line guess, as in
 * recomputeDistances.
 *
 * @param {{ supabase: object, listingId: string, lat: number, lng: number, measureImpl?: typeof measurePin }} args
 *   `supabase` must be a service-role client (faculty_distances writes are
 *   service-only, migrations 050/055).
 */
export async function refreshDistancesFromPin({
  supabase,
  listingId,
  lat,
  lng,
  measureImpl = measurePin,
}) {
  const targets = await loadMeasureTargets(supabase, '[refreshDistancesFromPin]');
  if (targets.error) return { ok: false, reason: targets.error };

  const { universities: measured, facultyMetres } = await measureImpl(
    { lat, lng },
    targets.faculties,
    { universities: targets.universities, caller: 'pin-move' },
  );

  const universities = await writeMeasuredUniversities(supabase, listingId, measured, { lat, lng });

  const byId = new Map(targets.faculties.map((f) => [f.faculty_id, f]));
  const rows = [];
  for (const [facultyId, metres] of facultyMetres) {
    const faculty = byId.get(facultyId);
    if (!faculty) continue;
    const { walk, transit } = distanceToMinutes(metres);
    rows.push({
      listing_id: listingId,
      faculty_id: facultyId,
      walk_minutes: walk,
      transit_minutes: transit,
      measured_from_lat: lat,
      measured_from_lng: lng,
      measured_to_lat: Number(faculty.lat),
      measured_to_lng: Number(faculty.lng),
    });
  }
  let facultyError = null;
  if (rows.length > 0) {
    const { error } = await supabase
      .from('faculty_distances')
      .upsert(rows, { onConflict: 'listing_id,faculty_id' });
    if (error) facultyError = error.message;
  }

  return {
    ok: universities.ok && !facultyError,
    universities,
    faculties: facultyError ? { ok: false, reason: `write: ${facultyError}` } : { ok: true, written: rows.length },
  };
}

// The destinations both tables are measured to. A universities read error is
// soft, as in /api/landlord/compute-university-distances: it costs the
// faculty-less universities, and the minimum check catches the rest.
async function loadMeasureTargets(supabase, tag) {
  const [
    { data: faculties, error: facultiesError },
    { data: universities, error: universitiesError },
  ] = await Promise.all([
    supabase.from('faculties').select('faculty_id, university, lat, lng'),
    supabase.from('universities').select('university_id, lat, lng'),
  ]);
  if (facultiesError) return { error: `faculties: ${facultiesError.message}` };
  if (universitiesError) console.error(`${tag} universities:`, universitiesError);
  return { faculties: faculties || [], universities: universities || [] };
}

async function writeMeasuredUniversities(supabase, listingId, measured, measuredFrom) {
  if (measured.length < MIN_UNIVERSITY_DISTANCES) {
    return { ok: false, reason: `only ${measured.length} universities measured; kept existing rows` };
  }
  const { error } = await writeUniversityDistances(supabase, listingId, measured, measuredFrom);
  if (error) return { ok: false, reason: `write: ${error}` };
  return { ok: true, written: measured.length };
}

/*
  FOSSGIS asks for at most 1 request/second, and its limiter HOLDS requests
  that arrive closer together (6–9 s, measured 2026-09-25). Sequential
  re-measures are spaced so each call lands in its own second.
*/
const ROUTER_SPACING_MS = 1100;

/**
 * Re-measure listings whose computed university distances no longer match
 * their pin (migration 126 stamps). The cron counterpart of the PATCH route's
 * pin-move refresh: it heals whatever that path missed, plus rows written
 * before the stamps existed.
 *
 * Only listings whose rows are ALL source='computed' are touched. A row a
 * landlord typed is theirs; re-measuring would silently replace it.
 *
 * @param {{ supabase: object, limit?: number, spacingMs?: number, remeasureImpl?: typeof remeasureUniversityDistances }} args
 *   `supabase` must be a service-role client.
 */
export async function healStaleUniversityDistances({
  supabase,
  limit = 5,
  spacingMs = ROUTER_SPACING_MS,
  remeasureImpl = remeasureUniversityDistances,
}) {
  const { data, error } = await supabase
    .from('listings')
    .select(
      'listing_id, location!inner ( lat, lng ), listing_university_distances ( source, measured_from_lat, measured_from_lng )',
    );
  if (error) return { ok: false, reason: `fetch listings: ${error.message}` };

  const stale = [];
  let skippedLandlordRows = 0;
  for (const row of data || []) {
    const lat = Number(row.location?.lat);
    const lng = Number(row.location?.lng);
    const rows = row.listing_university_distances || [];
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || rows.length === 0) continue;
    const isStale = rows.some(
      (r) =>
        r.measured_from_lat == null ||
        coordsChanged({ lat: r.measured_from_lat, lng: r.measured_from_lng }, { lat, lng }),
    );
    if (!isStale) continue;
    if (rows.some((r) => r.source !== 'computed')) {
      skippedLandlordRows++;
      continue;
    }
    stale.push({ listingId: row.listing_id, lat, lng });
  }

  const batch = stale.slice(0, limit);
  let healed = 0;
  const failed = [];
  for (let i = 0; i < batch.length; i++) {
    if (i > 0 && spacingMs > 0) await new Promise((r) => setTimeout(r, spacingMs));
    const { listingId, lat, lng } = batch[i];
    try {
      const result = await remeasureImpl({ supabase, listingId, lat, lng });
      if (result.ok) healed++;
      else failed.push(`${listingId}: ${result.reason}`);
    } catch (err) {
      failed.push(`${listingId}: ${err?.message || err}`);
    }
  }

  return {
    ok: failed.length === 0,
    stale: stale.length,
    healed,
    failed,
    remaining: stale.length - batch.length,
    skippedLandlordRows,
  };
}
