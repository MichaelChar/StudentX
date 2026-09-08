-- ============================================================
-- Migration 115: add no-argument overloads of
-- get_pending_landlord_notifications / get_pending_student_notifications.
--
-- Step 1 of 2 for issue #155. Migration 116 drops the old 1-arg forms.
--
-- WHY TWO MIGRATIONS. Migration 045 rewrote both functions to gate on
-- "is there an unread message newer than last_notified_at?", which left
-- `p_min_interval` unused in both bodies. It was kept in the signature
-- so the calling routes could land unchanged. Dropping it is the
-- follow-up.
--
-- But a signature change cannot follow CLAUDE.md's usual "apply the
-- migration, then merge the PR" order. Postgres cannot change a
-- function's signature in place, so it is DROP + CREATE — and between
-- applying that and the new code deploying, the RUNNING Worker would
-- still be calling get_pending_landlord_notifications(interval), which
-- would no longer exist. The message-digest job runs every 5 minutes,
-- so that gap is not theoretical: it would fail on the next tick and
-- keep failing until the deploy landed.
--
-- Unlike the other migrations in this series, where the deploy gap was
-- harmless, here it is a real outage of a live job. So:
--
--   115 (this)  CREATE the no-arg forms alongside the 1-arg ones.
--               Both exist. Old code keeps working. Apply BEFORE merge.
--   [deploy]    Routes switch to the no-arg call.
--   116         DROP the 1-arg forms. Apply AFTER the deploy lands.
--
-- 116 will therefore show RED on the `applied-to-prod` CI gate until
-- then. That is the drop-after-deploy case CLAUDE.md documents as going
-- red by design, not a failure.
--
-- The bodies below are copied verbatim from the live 1-arg functions,
-- minus the parameter — which is a pure deletion, since neither body
-- referenced it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_pending_landlord_notifications()
RETURNS TABLE(
  inquiry_id uuid, listing_id text, landlord_email text, landlord_name text,
  landlord_locale text, student_display_name text, unread_count integer,
  last_message_at timestamp with time zone, latest_message_body text,
  listing_address text, listing_neighborhood text, listing_monthly_price numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.get_pending_student_notifications()
RETURNS TABLE(
  inquiry_id uuid, listing_id text, student_email text, student_name text,
  student_locale text, landlord_display_name text, unread_count integer,
  last_message_at timestamp with time zone, latest_message_body text,
  listing_address text, listing_neighborhood text, listing_monthly_price numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
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

-- Match the 1-arg functions' grants EXACTLY: {postgres, service_role}.
--
-- The explicit REVOKEs are load-bearing, not decoration. These are NEW
-- functions, so Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon and authenticated automatically, and `REVOKE ALL FROM PUBLIC`
-- does NOT undo that (PUBLIC is not those roles). Migration 112 shipped
-- that exact mistake and had to be corrected — see its header. These
-- are digest internals called only by the cron Worker via the service
-- client; the issue's instruction to "re-grant EXECUTE to anon,
-- authenticated" is stale and would be a regression.
REVOKE ALL ON FUNCTION public.get_pending_landlord_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_landlord_notifications() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_landlord_notifications() TO service_role;

REVOKE ALL ON FUNCTION public.get_pending_student_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_student_notifications() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_student_notifications() TO service_role;
