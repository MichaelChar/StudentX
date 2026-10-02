import { createClient } from '@supabase/supabase-js';
import { healStaleUniversityDistances } from '@/lib/listingPinMove';

// Service-role client: writes listing_university_distances for any listing.
// Mirrors jobs/recomputeDistances.js.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

/**
 * Re-measure stale university distances (migration 126). Up to 5 listings a
 * run, spaced 1.1 s apart for FOSSGIS: ~7 s typical, inside the 20 s per-job
 * cap. Anything left over is reported as `remaining` and picked up next run.
 * @returns {Promise<{ ok: boolean, [key: string]: unknown }>}
 */
export async function runHealUniversityDistances() {
  return healStaleUniversityDistances({ supabase: getServiceSupabase(), limit: 5 });
}
