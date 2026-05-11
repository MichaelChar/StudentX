-- ============================================================
-- Migration 045: Suppress message-digest re-sends of identical content.
-- ============================================================
--
-- Pre-fix behavior (PR #40 landlord, PR #123 student): the cron's
-- debounce window (4m30s) is shorter than the cron tick (5 min), so
-- every tick re-claims and re-sends the same digest while
-- *_unread_count stays > 0. The get_pending_*_notifications functions
-- gated only on a coarse time-since-last-notify
-- (`last_notified_at < now() - p_min_interval`), not on whether new
-- messages had actually arrived since the last notification. Result:
-- a landlord with one unread message received the same digest email
-- every 5 minutes until they opened the chat in-app and triggered
-- mark_messages_read. Surfaced 2026-05-11 in issue #151 after PR #150
-- made the student-message-digest cron actually fire.
--
-- Fix: rewrite get_pending_landlord_notifications and
-- get_pending_student_notifications to return a row only when there
-- exists an unread message from the other side with `created_at >
-- last_notified_at` (i.e. a NEW message we haven't notified about
-- yet). Same return shape, same grants, same SECURITY DEFINER. The
-- partial index `idx_inquiry_messages_unread (inquiry_id, sender_role)
-- WHERE read_at IS NULL` (migration 027) serves the new EXISTS clause
-- efficiently.
--
-- The companion claim_*_message_notification RPCs are NOT changed.
-- Their conditional UPDATE remains the race-condition guard between
-- overlapping cron invocations (e.g. a tick that runs a few seconds
-- late doesn't get rejected by its own previous run); the new "is
-- there anything new to say" gating lives one layer up in
-- get_pending_*.
--
-- Effect on currently-stuck inquiries: any inquiry where the most
-- recent unread message has `created_at <= last_notified_at` is
-- immediately filtered out of the pending list on the next cron tick
-- after this migration applies. No data backfill needed — the new
-- query reads existing rows correctly.
--
-- Parameter note: p_min_interval is now unused inside both functions
-- but kept in the signature so the calling routes
-- (src/app/api/cron/{landlord,student}-message-digest/route.js)
-- continue to compile without a coordinated change. A follow-up PR
-- can drop the parameter once the migration has landed.

CREATE OR REPLACE FUNCTION public.get_pending_landlord_notifications(
  p_min_interval interval
) RETURNS TABLE (
  inquiry_id              UUID,
  listing_id              TEXT,
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
    LEFT JOIN location loc ON loc.location_id = l.location_id
    LEFT JOIN rent     r   ON r.rent_id       = l.rent_id
    LEFT JOIN landlord_message_notifications n
           ON n.inquiry_id = i.inquiry_id
   WHERE i.landlord_unread_count > 0
     AND ll.email IS NOT NULL
     -- "Is there at least one unread student message that arrived
     -- after we last notified this landlord?" Using
     -- read_at IS NULL (rather than read_at > last_notified_at) because
     -- read_at is the canonical "landlord acknowledged this" signal —
     -- mark_messages_read sets it transactionally alongside the
     -- unread-count zeroing. The partial index
     -- idx_inquiry_messages_unread (inquiry_id, sender_role) WHERE
     -- read_at IS NULL keeps this scan O(unread messages per inquiry).
     AND EXISTS (
       SELECT 1
         FROM inquiry_messages m
        WHERE m.inquiry_id = i.inquiry_id
          AND m.sender_role = 'student'
          AND m.read_at IS NULL
          AND (n.last_notified_at IS NULL
               OR m.created_at > n.last_notified_at)
     );
$function$;

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
     -- Mirror of the landlord variant: only return the inquiry if
     -- there's at least one unread landlord message newer than the
     -- last notification we sent. See the comment block above for the
     -- full rationale.
     AND EXISTS (
       SELECT 1
         FROM inquiry_messages m
        WHERE m.inquiry_id = i.inquiry_id
          AND m.sender_role = 'landlord'
          AND m.read_at IS NULL
          AND (n.last_notified_at IS NULL
               OR m.created_at > n.last_notified_at)
     );
$function$;
