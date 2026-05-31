-- 056_revoke_anon_landlord_contact_columns
--
-- Completes security audit finding #1 at the database layer. The application
-- no longer selects landlord contact_info on any public/anon path (PR #223),
-- but the public anon key can still read it directly through PostgREST
-- (GET /rest/v1/landlords?select=contact_info,email) because `anon` holds
-- table-level SELECT on every column.
--
-- Restrict `anon` to the non-sensitive columns the public listing join needs,
-- hiding contact_info, email, auth_user_id, and stripe_customer_id. This is
-- the standard Postgres mechanism for column-level read control (RLS cannot
-- restrict columns): revoke the table-wide SELECT, then grant the safe subset.
--
-- `authenticated` keeps full SELECT for now — the landlord owner reads their
-- own contact_info/email via the token-scoped client, and RLS already limits
-- which rows they see. Fully closing the authenticated-role residual (a
-- signed-in user reading *other* landlords' contact columns) needs an
-- owner-only column split or a service-role owner-read path; tracked as a
-- follow-up, lower priority than the no-auth anon vector closed here.
--
-- ⚠️ APPLY ONLY AFTER PR #223 is DEPLOYED. Applying earlier 500s the current
--    code, which still selects contact_info via the anon client.
--
-- Verify after applying: an anon GET /api/listings must still return listings
-- (landlord name + verified tier present) and contain no contact_info / email.
revoke select on public.landlords from anon;
grant select (
  landlord_id,
  name,
  created_at,
  updated_at,
  is_verified,
  verified_tier,
  onboarding_completed,
  preferred_locale,
  verified_tier_rank,
  founding_rank
) on public.landlords to anon;
