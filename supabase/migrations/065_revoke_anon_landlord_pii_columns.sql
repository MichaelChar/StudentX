-- Migration 065: close the anon landlord PII read residual.
--
-- Background
-- ----------
-- Migration 056 revoked only `contact_info` from the anon PostgREST role.
-- But the landlords SELECT RLS policy INTENTIONALLY exposes rows to anon
-- (the public catalog needs landlord name + verified tier), so column-level
-- grants are the ONLY thing protecting the rest of each row. `email`,
-- `stripe_customer_id`, and `auth_user_id` were still anon-SELECTable, so
-- `GET /rest/v1/landlords?select=email` with the public anon key harvested
-- landlord email addresses (verified live on prod 2026-07-03).
--
-- Fix: deny-by-default
-- --------------------
-- Revoke the blanket SELECT and grant back ONLY the public catalog columns.
-- Any future PII column added to `landlords` is therefore anon-safe
-- automatically — it must be explicitly granted before it can leak. This
-- allowlist mirrors LANDLORD_SELECT in src/lib/landlordProfile.js.
--
-- Consuming code: every server read that selects/filters a NON-allowlisted
-- column on the anon client has been moved to the service-role client in
-- the same PR. Apply this migration only AFTER that code is deployed, or
-- landlord billing/profile/inquiries/analytics routes will 500 in the gap.

revoke select on public.landlords from anon;

grant select (
  landlord_id,
  name,
  verified_tier,
  is_verified,
  verified_tier_rank,
  profile_photo_url,
  created_at
) on public.landlords to anon;

-- students: intentionally NOT touched.
-- The students table has no anon SELECT RLS policy (only `authenticated` may
-- read its own row via `auth_user_id = auth.uid()`), so RLS default-denies
-- anon EVERY row regardless of column grants — verified 2026-07-03: anon
-- `GET /rest/v1/students` returns []. Future student accounts are equally
-- invisible to anon, so no column revoke is required here.
