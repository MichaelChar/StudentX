-- 056_revoke_anon_landlord_contact_columns
--
-- Completes security audit finding #1 at the database layer. The application
-- no longer selects landlord contact_info on any public/anon path (PR #223),
-- but the public anon key can still read it directly through PostgREST
-- (GET /rest/v1/landlords?select=contact_info) because `anon` holds
-- table-level SELECT on every column. Postgres can't column-restrict via RLS,
-- so we revoke the table-wide SELECT and re-grant a safe subset.
--
-- SCOPE: only `contact_info` is removed from `anon`. Several server-side reads
-- legitimately go through the ANON client (getSupabase()) keyed by
-- `.eq('auth_user_id', …)` after verifying the JWT — getLandlordId across the
-- landlord API, billing checkout (selects email), billing portal (selects
-- stripe_customer_id), and the profile-create POST (selects email). Postgres
-- requires SELECT on any column named in a WHERE filter, so revoking
-- auth_user_id / email / stripe_customer_id from anon would break the landlord
-- portal, billing, and signup. After PR #223, NO anon read selects
-- contact_info, so revoking just that column is safe.
--
-- RESIDUAL (documented, not closed here): `email` is still anon-readable via
-- the raw endpoint, and for many landlords contact_info == email — so this
-- does not fully stop email harvesting. Fully closing it means migrating the
-- handful of anon-client landlord reads above to the service-role/token client
-- so anon never touches landlords except the public listing join (name,
-- verified_tier, is_verified, verified_tier_rank), then revoking the rest.
-- That touches auth/billing/signup hot paths and is tracked as a follow-up.
--
-- ⚠️ APPLY ONLY AFTER PR #223 is DEPLOYED. Applying earlier 500s the current
--    code, which still selects contact_info via the anon client.
--
-- Verify after applying: an anon GET /api/listings must still return listings
-- (landlord name + verified tier present) and contain no contact_info.
--
-- The grant is built DYNAMICALLY from the columns that actually exist: the
-- repo's clean-stack `landlords` table is missing columns prod has
-- (is_verified, verified_tier, … — prod/repo drift), so a hardcoded column
-- list fails `supabase start`. Granting "every existing column except
-- contact_info" produces the same result on prod and stays portable.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'landlords'
    and column_name <> 'contact_info';

  revoke select on public.landlords from anon;
  execute format('grant select (%s) on public.landlords to anon', cols);
end $$;
