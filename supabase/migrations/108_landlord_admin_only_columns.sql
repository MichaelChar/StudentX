-- 108: a landlord may no longer award themselves verification, tier, or stats.
--
-- THE HOLE. `landlords` has RLS enabled and an UPDATE policy scoped to the
-- caller's own row:
--
--   "Landlords can update their own record"
--     USING      (auth_user_id = (select auth.uid()))
--     WITH CHECK (auth_user_id = (select auth.uid()))
--
-- It restricts WHICH ROW may be written and says nothing about WHICH COLUMNS.
-- Column privileges were the only other gate, and every one of the 17 columns
-- was granted UPDATE to `authenticated` (and to `anon`). A signed-in landlord
-- could therefore PATCH their own row through the REST endpoint, bypassing the
-- application route entirely, and set:
--
--   is_verified              -> the free ID check the "Identity verified" badge
--                               attests to, and one of the three gates in
--                               canAdminGoLive(). Self-attested until now.
--   verified_tier
--   verified_tier_rank       -> ranking inputs.
--   avg_response_ms
--   response_stats_at        -> the "Replies within an hour" stat now shown on
--                               the public profile (#462). Written by the
--                               refresh-response-times cron; forgeable by hand.
--   created_at               -> the "Member since" line on the same profile.
--   stripe_customer_id       -> billing identity.
--   email, auth_user_id,
--   landlord_id              -> identity and the FK every listing hangs off.
--
-- The application route was never the problem: /api/landlord/profile PATCH
-- already whitelists what it writes. The exposure is direct REST access with
-- the anon key and a valid landlord JWT.
--
-- THE FIX is column-level, not policy-level: revoke the blanket grants and
-- re-grant exactly what the app writes as the landlord.
--
--   PATCH  (profile settings)  -> preferred_locale, profile_photo_url
--   INSERT (signup)            -> landlord_id, name, contact_info,
--                                 auth_user_id, email, profile_photo_url
--
-- Everything else is written by service-role paths that bypass RLS and are
-- unaffected: admin approval sets is_verified
-- (api/admin/verifications/[id]), the refresh-response-times cron sets the
-- stats, and link_orphan_landlord is SECURITY DEFINER so it runs as owner.
--
-- SELECT IS DELIBERATELY UNTOUCHED. PR #463 converted eleven landlord API
-- routes to do their self-lookup on the caller's own token, which depends on
-- `authenticated` keeping SELECT on landlord_id and auth_user_id. Revoking
-- SELECT here would break all eleven at once, in production, ahead of any
-- code change. Do not add SELECT to the revokes below.

BEGIN;

-- anon: no INSERT or UPDATE policy exists for this role, so RLS already denies
-- these. The grants were dead weight pointing the wrong way; remove them so the
-- privilege surface matches the intent.
REVOKE INSERT, UPDATE ON public.landlords FROM anon;

REVOKE INSERT, UPDATE ON public.landlords FROM authenticated;

-- Exactly what /api/landlord/profile PATCH writes.
GRANT UPDATE (preferred_locale, profile_photo_url)
  ON public.landlords TO authenticated;

-- Exactly what /api/landlord/profile POST inserts at signup. The INSERT policy
-- ("Users can create their own landlord profile", WITH CHECK auth_user_id =
-- auth.uid()) still constrains the row; these constrain the columns.
GRANT INSERT (landlord_id, name, contact_info, auth_user_id, email, profile_photo_url)
  ON public.landlords TO authenticated;

COMMIT;
