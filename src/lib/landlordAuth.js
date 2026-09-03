/*
  Resolving "which landlord is this caller?" — without the service-role key.

  Ten landlord API routes opened with a private copy of this lookup running on
  `getSupabaseAsService()`, each carrying the same comment:

    // Service-role: migration 065 drops auth_user_id from the anon column
    // allowlist on landlords, so this self-lookup can't run on the anon client.

  THE PREMISE IS TRUE AND THE CONCLUSION DOES NOT FOLLOW. Migration 065 dropped
  `auth_user_id` from the **anon** allowlist. `authenticated` kept it:

    anon           INSERT, REFERENCES, UPDATE          (no SELECT)
    authenticated  INSERT, REFERENCES, UPDATE, SELECT

  `getSupabaseWithToken(token)` sends the caller's JWT, so PostgREST runs the
  request as `authenticated`, not `anon`. RLS permits the read too — the
  landlords SELECT policy is `public` / `true`. The lookup therefore works on
  the caller's own token, and the service-role key was never required.

  WHY THIS IS WORTH FIXING RATHER THAN LEAVING ALONE.

  1. The service-role key bypasses RLS entirely. Reaching for it to answer a
     question the caller's own token can answer widens the blast radius of any
     bug in those routes and buys nothing.
  2. `.env.local` carries no SUPABASE_SERVICE_ROLE_KEY, so every one of those
     routes 500'd in local development and the landlord portal could not be
     exercised at all. That is how this was found: /api/landlord/nav-summary
     was written without the dependency (#460) and worked, while its ten
     siblings did not.

  This does NOT remove the service client from routes that use it for other
  work — inserting `rent` / `location` rows, recomputing `faculty_distances`,
  copying a listing. Those genuinely bypass RLS and keep it.
*/

/**
 * The landlord row belonging to an authenticated user, or null.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 *        MUST be token-scoped (`getSupabaseWithToken`). Passing the anon
 *        client returns null, because anon cannot select `auth_user_id`.
 * @param {string} userId  JWT-derived, so the read stays scoped to the caller.
 * @returns {Promise<string|null>} the landlord_id, or null when the user has
 *          no landlord profile (an ordinary outcome — a student, or a
 *          landlord mid-signup — not an error).
 */
export async function landlordIdForUser(supabase, userId) {
  const row = await landlordRowForUser(supabase, userId, 'landlord_id');
  return row?.landlord_id ?? null;
}

/**
 * The same lookup, when the caller needs more than the id.
 *
 * `columns` must stay inside what `authenticated` may select on `landlords`.
 * `email` and `onboarding_completed` are fine — migration 065 removed those
 * from **anon** only. Owner-only PII (`contact_info`, `stripe_customer_id`)
 * is not, and asking for it here would fail rather than leak, which is the
 * correct direction for that mistake.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase token-scoped
 * @param {string} userId JWT-derived
 * @param {string} columns PostgREST select list
 * @returns {Promise<object|null>}
 */
export async function landlordRowForUser(supabase, userId, columns = 'landlord_id') {
  if (!supabase || !userId) return null;
  const { data } = await supabase
    .from('landlords')
    .select(columns)
    .eq('auth_user_id', userId)
    .single();
  return data ?? null;
}
