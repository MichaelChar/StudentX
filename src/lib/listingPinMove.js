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
 * rows at once (a gap is better than a wrong number; the recompute and the
 * daily cron refill it), and re-measures the universities after the response
 * (remeasureUniversityDistances).
 */

import { computeUniversityDistances } from '@/lib/computeUniversityDistances';
import {
  MIN_UNIVERSITY_DISTANCES,
  writeUniversityDistances,
} from '@/lib/universityDistances';

export { coordsChanged } from '@/lib/coordsChanged';

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
  const [
    { data: faculties, error: facultiesError },
    { data: universities, error: universitiesError },
  ] = await Promise.all([
    supabase.from('faculties').select('faculty_id, university, lat, lng'),
    supabase.from('universities').select('university_id, lat, lng'),
  ]);
  if (facultiesError) return { ok: false, reason: `faculties: ${facultiesError.message}` };
  if (universitiesError) {
    // Soft, as in /api/landlord/compute-university-distances: costs the
    // faculty-less universities, and the length check below catches the rest.
    console.error('[remeasureUniversityDistances] universities:', universitiesError);
  }

  const measured = await computeImpl({ lat, lng }, faculties || [], {
    universities: universities || [],
  });
  if (measured.length < MIN_UNIVERSITY_DISTANCES) {
    return { ok: false, reason: `only ${measured.length} universities measured; kept existing rows` };
  }

  const { error } = await writeUniversityDistances(supabase, listingId, measured);
  if (error) return { ok: false, reason: `write: ${error}` };
  return { ok: true, written: measured.length };
}
