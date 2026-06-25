-- 058_revoke_anon_landlord_pii_columns
--
-- Closes the landlord email/PII anon-read residual documented in migration 056.
-- Migration 056 revoked only `contact_info` from the anon role because several
-- server-side reads still used the anon client to SELECT or filter on `email`,
-- `stripe_customer_id`, and `auth_user_id`. Those reads have now been migrated
-- to the service-role client (`getSupabaseAsService`) in the accompanying code
-- PR, so the full revoke is safe.
--
-- WHAT THIS DOES:
--   1. Revokes all column-level SELECT on public.landlords from the anon role.
--   2. Re-grants SELECT only on the five columns needed for the public listing
--      join (landlord name and verification badge on the student-facing catalog).
--
-- These five columns are always present in both prod and the clean-stack repo
-- (verified), so a hardcoded grant is used — unlike migration 056 which built
-- the grant list dynamically to exclude a single column. A hardcoded list is
-- safer here because we are granting a minimal allowlist, not "everything
-- except one column".
--
-- COLUMNS RETAINED FOR ANON:
--   landlord_id      — join key used by the listings API
--   name             — displayed on listing cards and detail pages
--   verified_tier    — 'none' | 'verified' | 'verified_pro' (badge display)
--   is_verified      — boolean badge flag
--   verified_tier_rank — numeric rank used for sort ordering
--
-- COLUMNS REMOVED FROM ANON (PII / billing / auth):
--   email            — owner PII; contact_info often equals email
--   contact_info     — already revoked by migration 056; maintained here
--   stripe_customer_id — Stripe billing handle
--   auth_user_id     — Supabase auth UUID
--   (all other columns not in the allowlist above)
--
-- AFFECTED CODE (migrated in the same PR — apply code BEFORE this migration):
--   billing/checkout/route.js  getLandlord()       → getSupabaseAsService()
--   billing/checkout/route.js  getOrCreateCustomer → getSupabaseAsService()
--   billing/portal/route.js    getLandlord()       → getSupabaseAsService()
--   billing/subscription/route.js getLandlord()    → getSupabaseAsService()
--   profile/route.js POST      existing-check      → getSupabaseAsService()
--   profile/route.js POST      orphan-check        → getSupabaseAsService()
--   verification/route.js      getLandlordId()     → getServiceSupabase()
--   response-time/route.js     getLandlordId()     → getSupabaseAsService()
--   inquiries/route.js         getLandlordId()     → getSupabaseAsService()
--   inquiries/[id]/route.js    getLandlordId()     → getSupabaseAsService()
--   listings/route.js          getLandlordId()     → getSupabaseAsService()
--   listings/[id]/route.js     getLandlordId()     → getSupabaseAsService()
--   analytics/route.js         getLandlordId()     → getSupabaseAsService()
--
-- ⚠️ APPLY ONLY AFTER THE CODE PR IS DEPLOYED TO PRODUCTION.
--    Applying this migration before the code deploys will 500 every landlord
--    portal, billing, and analytics route that currently reads landlords via
--    the anon client. The code PR must ship first — only then is this migration
--    safe to apply.
--
-- Verify after applying:
--   • Anon GET /rest/v1/landlords?select=email        → HTTP 400 (no col access)
--   • Anon GET /rest/v1/landlords?select=landlord_id  → HTTP 200 (still allowed)
--   • Anon GET /api/listings returns listing cards with landlord name + tier
--   • A landlord can sign in, view billing, and access the portal without 500s

-- Grant is built dynamically: intersect the 5-column safe allowlist with
-- columns that actually exist in this stack. The clean-stack repo is missing
-- `is_verified` (it exists in prod via APPLY_004_to_012.sql but no numbered
-- migration adds it — same prod/repo drift documented in migration 056).
-- The dynamic approach grants what exists and is safe, on both stacks.
do $$
declare
  safe_cols text[] := ARRAY['landlord_id', 'name', 'verified_tier', 'is_verified', 'verified_tier_rank'];
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name  = 'landlords'
    and column_name = ANY(safe_cols);

  revoke select on public.landlords from anon;
  execute format('grant select (%s) on public.landlords to anon', cols);
end $$;
