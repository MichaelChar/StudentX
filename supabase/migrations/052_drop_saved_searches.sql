-- ============================================================
-- Migration 052: Drop the saved-searches / alerts feature.
-- ============================================================
--
-- The saved-searches (email-alert) feature was retired. This removes its
-- two database objects:
--
--   * claim_digest_send(uuid, interval) — the idempotent-send RPC added in
--     migration 022 and locked down to service_role in migration 049. It
--     only ever touched saved_searches, so it has no other callers.
--   * saved_searches — the table created in migration 015, with the three
--     anon RLS policies added in migration 048 (§3). DROP TABLE ... CASCADE
--     removes the table together with its indexes and policies.
--
-- SAFETY — this does NOT touch the message-digest machinery, which is a
-- separate code path:
--   * landlord/student message digests use their own tables and RPCs
--     (get_pending_*_notifications, claim_landlord_message_notification,
--     claim_student_message_notification — migrations 032/033/044) and the
--     landlordMessageDigest / studentMessageDigest email templates.
--   * Those RPCs do not reference saved_searches or claim_digest_send.
-- Verified by reading src/app/api/cron/{landlord,student}-message-digest/route.js
-- before writing this migration.
--
-- Drop the function first (it reads saved_searches), then the table.
-- ============================================================

DROP FUNCTION IF EXISTS public.claim_digest_send(uuid, interval);

DROP TABLE IF EXISTS public.saved_searches CASCADE;
