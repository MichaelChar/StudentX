-- ============================================================
-- Migration 048: Enable RLS on all unprotected public tables.
-- ============================================================
--
-- The Supabase dashboard flags 14+ tables with "RLS Disabled in
-- Public — CRITICAL". They fall into three categories:
--
--   A. Dimension/reference tables (001): property_types, amenities,
--      faculties, faculty_distances. Public-read; writes are
--      migrations/seed only (except faculty_distances, written by
--      the recompute-distances cron via the anon client).
--
--   B. Server-side-only tables (015, 016, 032, 044):
--      landlord_message_notifications, student_message_notifications,
--      saved_searches, verification_requests. Accessed via SECURITY
--      DEFINER RPCs or service-role client.
--
--   C. Phantom tables (not in any migration or application code):
--      billing_customers, invoices, support_tickets, report_history,
--      profiles, tenants. Likely created manually in the dashboard.
--
-- This migration enables RLS on every table above, adds the minimum
-- permissive policies needed to preserve existing access, and
-- opportunistically locks down the student digest RPCs (same gap
-- that migration 033 fixed on the landlord side).
-- ============================================================


-- ---- Section 1: Dimension tables ------------------------------------

ALTER TABLE property_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read property_types"
  ON property_types FOR SELECT
  USING (true);


ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read amenities"
  ON amenities FOR SELECT
  USING (true);


ALTER TABLE faculties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read faculties"
  ON faculties FOR SELECT
  USING (true);


ALTER TABLE faculty_distances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read faculty_distances"
  ON faculty_distances FOR SELECT
  USING (true);

-- The recompute-distances cron upserts rows via the anon client
-- (src/lib/recomputeDistances.js). Permissive INSERT + UPDATE for
-- anon preserves that path. Follow-up: move to a SECURITY DEFINER
-- RPC or service-role client, then drop these write policies.
CREATE POLICY "Anon can insert faculty_distances"
  ON faculty_distances FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update faculty_distances"
  ON faculty_distances FOR UPDATE TO anon
  USING (true);


-- ---- Section 2: Notification tables ---------------------------------
-- Both tables are accessed exclusively via SECURITY DEFINER RPCs,
-- which bypass RLS. Enabling RLS with no policies blocks any
-- accidental direct access from anon/authenticated clients.

ALTER TABLE landlord_message_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE student_message_notifications ENABLE ROW LEVEL SECURITY;

-- Fix: student digest RPCs are still granted to anon/authenticated
-- (migration 044), but the cron route already uses getServiceSupabase().
-- Mirrors the lockdown in migration 033 for the landlord side.
REVOKE EXECUTE ON FUNCTION public.get_pending_student_notifications(interval)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_student_notifications(interval)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_student_message_notification(uuid, interval, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_student_message_notification(uuid, interval, int)
  TO service_role;


-- ---- Section 3: saved_searches --------------------------------------
-- The saved-searches API and cron both use the anon client for direct
-- table access. Permissive policies preserve that path. The
-- claim_digest_send RPC revocation is deferred to a follow-up
-- migration (requires companion code change first).

ALTER TABLE saved_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read saved_searches"
  ON saved_searches FOR SELECT TO anon
  USING (true);

CREATE POLICY "Anon can insert saved_searches"
  ON saved_searches FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update saved_searches"
  ON saved_searches FOR UPDATE TO anon
  USING (true);


-- ---- Section 4: verification_requests -------------------------------
-- All access uses getServiceSupabase() (service-role), which bypasses
-- RLS. No policies needed — fail-closed for any other client.

ALTER TABLE verification_requests ENABLE ROW LEVEL SECURITY;


-- ---- Section 5: Phantom tables --------------------------------------
-- Not created by any migration, not referenced by any application code.
-- IF EXISTS guards against environments where they don't exist (CI,
-- local dev). No policies — blocks all non-service-role access.

ALTER TABLE IF EXISTS billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS report_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tenants ENABLE ROW LEVEL SECURITY;
