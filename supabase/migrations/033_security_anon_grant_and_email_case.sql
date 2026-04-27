-- ============================================================
-- Migration 033: Lock down landlord-digest RPCs to service_role
-- only (PM #40), and enforce lowercase email on students (PM #38).
-- ============================================================
--
-- Section 1 (PM #40 follow-up to migration 032):
-- get_pending_landlord_notifications and
-- claim_landlord_message_notification were granted to anon and
-- authenticated in 032 because the cron route at
-- /api/cron/landlord-message-digest was using the anon Supabase
-- client. That made the SECURITY DEFINER context — which can read
-- landlord emails, student names, listing addresses, and the latest
-- unread message body — reachable by anyone with the public anon key,
-- bypassing the CRON_SECRET gate on the HTTP route. Locking claim
-- down too is load-bearing: an attacker could otherwise hammer it
-- with arbitrary inquiry UUIDs to advance last_notified_at and DoS
-- legitimate digests.
--
-- Pairs with src/app/api/cron/landlord-message-digest/route.js,
-- which switches from the anon client (getSupabase) to a
-- service-role client built inline (mirroring the established
-- pattern in src/lib/metrics/supabase.js and the admin routes).
--
-- Section 2 (PM #38 follow-up to migration 029):
-- The handle_new_student_user trigger inserts lower(NEW.email), but
-- the existing UNIQUE constraint on students.email is case-sensitive.
-- Any write path that bypasses the trigger (manual SQL, future OAuth
-- variations, admin tooling) could introduce case drift. A CHECK
-- constraint pinning email to its lowercase form makes the existing
-- UNIQUE behave as case-folded without touching the index.
-- ============================================================

-- ---- Section 1: revoke anon access to landlord digest RPCs --------

REVOKE EXECUTE ON FUNCTION public.get_pending_landlord_notifications(interval)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_pending_landlord_notifications(interval)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.claim_landlord_message_notification(uuid, interval, int)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_landlord_message_notification(uuid, interval, int)
  TO service_role;

-- ---- Section 2: enforce lowercase email on students ---------------

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_email_lowercase_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_email_lowercase_check
  CHECK (email = lower(email));
