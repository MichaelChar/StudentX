-- ============================================================
-- Migration 049: Lock down saved-search digest RPC to service_role.
-- ============================================================
--
-- claim_digest_send (migration 022) was granted to anon and
-- authenticated because the cron route at
-- /api/cron/saved-searches-digest was using the anon Supabase
-- client. That made the SECURITY DEFINER context — which can
-- write to saved_searches.last_notified_at — reachable by anyone
-- with the public anon key, bypassing the CRON_SECRET gate on the
-- HTTP route. An attacker could hammer it with arbitrary
-- saved_search UUIDs to advance last_notified_at and suppress
-- legitimate digest emails.
--
-- Mirrors migration 033 (which locked down the landlord digest
-- RPCs). Pairs with src/app/api/cron/saved-searches-digest/route.js
-- which now uses a service-role client.
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.claim_digest_send(uuid, interval)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_digest_send(uuid, interval)
  TO service_role;
