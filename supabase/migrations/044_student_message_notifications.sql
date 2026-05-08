-- ============================================================
-- Migration 044: Per-message email digest tracking for students.
-- ============================================================
--
-- Mirror of migration 032 (landlord_message_notifications), inverted:
-- 032 emails the landlord when a student sends a chat message; this
-- emails the student when the landlord replies. Without this, students
-- start a conversation and have no out-of-app signal that the landlord
-- ever responded — they only see the reply if they happen to be in the
-- chat or check the inbox manually.
--
-- The bookkeeping column inquiries.student_unread_count already exists
-- (migration 026) and is maintained by the trigger from 027/028, so no
-- schema change there. This migration adds only the notifications table
-- + RPCs paralleling the landlord side.
--
-- Cron wiring lives in wrangler.jsonc + cf/worker-entry.mjs:
-- 2-58/5 * * * *  → /api/cron/student-message-digest (offset 2 min from
-- the landlord cron at */5 to spread scheduled-handler load).
--
-- Server-side-only table with RLS disabled, mutated only via SECURITY
-- DEFINER RPCs. Same shape as landlord_message_notifications (032) and
-- saved_searches' claim_digest_send (022).

CREATE TABLE student_message_notifications (
  inquiry_id            UUID PRIMARY KEY REFERENCES inquiries(inquiry_id) ON DELETE CASCADE,
  last_notified_at      TIMESTAMPTZ,
  unread_count_snapshot INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_message_notifications DISABLE ROW LEVEL SECURITY;

-- ---- get_pending_student_notifications -----------------------------
-- Returns one row per inquiry that has unread *landlord* messages and
-- either has never been notified or was last notified longer than
-- p_min_interval ago. Bundles the recipient student's email/name/locale,
-- the actor landlord's display name, the listing summary, and the latest
-- unread landlord message body so the cron route can build the email in
-- a single round trip.
--
-- The bundled SELECTs span students + inquiry_messages, both of which
-- are RLS-restricted to thread participants — the service-role cron
-- client bypasses RLS, but the SECURITY DEFINER context keeps this
-- working from any caller (anon, authenticated) that is granted EXECUTE.
CREATE OR REPLACE FUNCTION public.get_pending_student_notifications(
  p_min_interval interval
) RETURNS TABLE (
  inquiry_id              UUID,
  listing_id              TEXT,
  student_email           TEXT,
  student_name            TEXT,
  student_locale          TEXT,
  landlord_display_name   TEXT,
  unread_count            INT,
  last_message_at         TIMESTAMPTZ,
  latest_message_body     TEXT,
  listing_address         TEXT,
  listing_neighborhood    TEXT,
  listing_monthly_price   NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT i.inquiry_id,
         i.listing_id,
         st.email,
         st.display_name,
         st.preferred_locale,
         ll.name,
         i.student_unread_count,
         i.last_message_at,
         (SELECT m.body
            FROM inquiry_messages m
           WHERE m.inquiry_id = i.inquiry_id
             AND m.sender_role = 'landlord'
             AND m.read_at IS NULL
           ORDER BY m.created_at DESC
           LIMIT 1) AS latest_message_body,
         loc.address,
         loc.neighborhood,
         r.monthly_price
    FROM inquiries i
    JOIN students  st ON st.auth_user_id = i.student_user_id
    JOIN listings  l  ON l.listing_id    = i.listing_id
    JOIN landlords ll ON ll.landlord_id  = l.landlord_id
    LEFT JOIN location loc ON loc.location_id = l.location_id
    LEFT JOIN rent     r   ON r.rent_id       = l.rent_id
    LEFT JOIN student_message_notifications n
           ON n.inquiry_id = i.inquiry_id
   WHERE i.student_unread_count > 0
     AND st.email IS NOT NULL
     AND (n.last_notified_at IS NULL
          OR n.last_notified_at < now() - p_min_interval);
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_student_notifications(interval)
  TO anon, authenticated;

-- ---- claim_student_message_notification ----------------------------
-- Conditional UPSERT mirroring claim_landlord_message_notification (032)
-- and claim_digest_send (022): the cron route calls this BEFORE
-- dispatching to Resend. First caller advances last_notified_at and
-- gets true; concurrent / retried callers within p_min_interval get
-- false and skip silently. This is the per-inquiry debounce.
--
-- p_unread_count is the snapshot at claim time, kept for observability.
CREATE OR REPLACE FUNCTION public.claim_student_message_notification(
  p_inquiry_id   uuid,
  p_min_interval interval,
  p_unread_count int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated int;
BEGIN
  INSERT INTO student_message_notifications
              (inquiry_id, last_notified_at, unread_count_snapshot)
       VALUES (p_inquiry_id, now(), p_unread_count)
  ON CONFLICT (inquiry_id) DO UPDATE
     SET last_notified_at      = now(),
         unread_count_snapshot = EXCLUDED.unread_count_snapshot
   WHERE student_message_notifications.last_notified_at IS NULL
      OR student_message_notifications.last_notified_at
         < now() - p_min_interval;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_student_message_notification(uuid, interval, int)
  TO anon, authenticated;
