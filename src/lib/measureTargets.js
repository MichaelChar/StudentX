/**
 * The destinations a listing pin is measured to: every faculty, plus the
 * migration-119 campus points on `universities`.
 *
 * The one loader for both places that measure a pin: the landlord wizard's
 * prefill (/api/landlord/compute-university-distances) and the server-side
 * re-measures in listingPinMove.js. With two copies, a change to one (a new
 * column, a changed fallback rule) would silently make the wizard and the
 * server disagree about the same pin.
 *
 * Any client works. `faculties` and `universities` are fully public (RLS
 * "Public can read faculties", qual true, and every selected column is
 * granted to anon and authenticated alike), so a service-role key unlocks
 * nothing here. Requiring one once made the wizard route 500 in any
 * environment without that secret.
 *
 * `universities` matters because prod's `faculties` holds AUTH rows only;
 * without these points UoM and IHU can't be measured at all. Faculties still
 * win where they exist (nearest campus beats a centroid).
 *
 * A faculties error is fatal: there is nothing to measure to. A universities
 * error is soft: it costs the faculty-less universities, not the whole
 * measurement, and callers' minimum-row checks catch the rest.
 *
 * @param {object} supabase
 * @param {string} tag - log prefix naming the caller
 * @returns {Promise<{ faculties: Array<object>, universities: Array<object> } | { error: string }>}
 */
export async function loadMeasureTargets(supabase, tag) {
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
