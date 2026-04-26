-- ============================================================
-- Migration 032: Per-message email digest tracking for landlords.
-- ============================================================
--
-- After PR #38, the chat thread between student and landlord lives
-- entirely in-app. The legacy first-inquiry email still fires on
-- inquiry creation (see src/lib/inquiryEmail.js) but every subsequent
-- student message is in-app only — landlords with no notification
-- habit miss the conversation.
--
-- This migration adds the bookkeeping for a debounced digest. A
-- scheduled Cloudflare Worker (cf/worker-entry.mjs) ticks every five
-- minutes and POSTs to /api/cron/landlord-message-digest. That route
-- finds inquiries with landlord_unread_count > 0 that haven't been
-- notified within the debounce window, sends one summary email per
-- inquiry, and stamps last_notified_at here.
--
-- The shape mirrors saved_searches + claim_digest_send (migration 022):
-- a server-side-only table with RLS disabled, mutated only via
-- SECURITY DEFINER RPCs. Keeping the notification logic separate from
-- the inquiry_messages triggers (027/028) means we can change the
-- debounce window or kill the digest without touching message writes.

CREATE TABLE landlord_message_notifications (
  inquiry_id            UUID PRIMARY KEY REFERENCES inquiries(inquiry_id) ON DELETE CASCADE,
  last_notified_at      TIMESTAMPTZ,
  unread_count_snapshot INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-side-only table (mirrors saved_searches): no RLS, accessed
-- only via the SECURITY DEFINER RPCs below. The cron route uses the
-- anon Supabase client, so the grants must reach `anon`.
ALTER TABLE landlord_message_notifications DISABLE ROW LEVEL SECURITY;

-- ---- get_pending_landlord_notifications ----------------------------
-- Returns one row per inquiry that has unread student messages and
-- either has never been notified or was last notified longer than
-- p_min_interval ago. Bundles the student display name, the listing
-- summary fields, and the latest unread student message body so the
-- cron route can build the email in a single round trip.
--
-- The bundled SELECTs span students + inquiry_messages, both of which
-- are RLS-restricted to thread participants — the anon cron client
-- cannot read them directly, so the SECURITY DEFINER context here is
-- load-bearing.
CREATE OR REPLACE FUNCTION public.get_pending_landlord_notifications(
  p_min_interval interval
) RETURNS TABLE (
  inquiry_id              UUID,
  listing_id              UUID,
  landlord_email          TEXT,
  landlord_name           TEXT,
  landlord_locale         TEXT,
  student_display_name    TEXT,
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
         ll.email,
         ll.name,
         ll.preferred_locale,
         st.display_name,
         i.landlord_unread_count,
         i.last_message_at,
         (SELECT m.body
            FROM inquiry_messages m
           WHERE m.inquiry_id = i.inquiry_id
             AND m.sender_role = 'student'
             AND m.read_at IS NULL
           ORDER BY m.created_at DESC
           LIMIT 1) AS latest_message_body,
         loc.address,
         loc.neighborhood,
         r.monthly_price
    FROM inquiries i
    JOIN listings  l  ON l.listing_id  = i.listing_id
    JOIN landlords ll ON ll.landlord_id = l.landlord_id
    LEFT JOIN students st ON st.auth_user_id = i.student_user_id
    LEFT JOIN location loc ON loc.listing_id = l.listing_id
    LEFT JOIN rent     r   ON r.listing_id   = l.listing_id
    LEFT JOIN landlord_message_notifications n
           ON n.inquiry_id = i.inquiry_id
   WHERE i.landlord_unread_count > 0
     AND ll.email IS NOT NULL
     AND (n.last_notified_at IS NULL
          OR n.last_notified_at < now() - p_min_interval);
$function$;

GRANT EXECUTE ON FUNCTION public.get_pending_landlord_notifications(interval)
  TO anon, authenticated;

-- ---- claim_landlord_message_notification ---------------------------
-- Conditional UPSERT mirroring claim_digest_send (022): the cron route
-- calls this BEFORE dispatching to Resend. First caller advances
-- last_notified_at and gets true; concurrent or retried callers within
-- p_min_interval get false and skip silently. This is the debounce.
--
-- p_unread_count is the snapshot at claim time, kept for observability
-- (lets us see how big each digest was without re-querying inquiries).
CREATE OR REPLACE FUNCTION public.claim_landlord_message_notification(
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
  INSERT INTO landlord_message_notifications
              (inquiry_id, last_notified_at, unread_count_snapshot)
       VALUES (p_inquiry_id, now(), p_unread_count)
  ON CONFLICT (inquiry_id) DO UPDATE
     SET last_notified_at      = now(),
         unread_count_snapshot = EXCLUDED.unread_count_snapshot
   WHERE landlord_message_notifications.last_notified_at IS NULL
      OR landlord_message_notifications.last_notified_at
         < now() - p_min_interval;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_landlord_message_notification(uuid, interval, int)
  TO anon, authenticated;
