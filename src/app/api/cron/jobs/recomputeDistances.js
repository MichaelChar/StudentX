import { createClient } from '@supabase/supabase-js';
import { recomputeMissingDistances } from '@/lib/recomputeDistances';

// Service-role client: bypasses RLS so the cron can write faculty_distances
// without per-row policies. Mirrors the pattern in landlord-message-digest.
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

/**
 * Heal missing faculty_distances rows (PR #60).
 * @returns {Promise<{ ok: boolean, [key: string]: unknown }>}
 */
export async function runRecomputeDistances() {
  return recomputeMissingDistances({ supabase: getServiceSupabase() });
}
