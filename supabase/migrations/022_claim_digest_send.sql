-- ============================================================
-- Migration 022: Add claim_digest_send() for idempotent digests.
-- ============================================================
-- The cron route /api/cron/saved-searches-digest sends a digest
-- email per active saved_search and then UPDATEs last_notified_at.
-- If the email send succeeds but the UPDATE fails (network blip,
-- transient connection issue) — or if Cloudflare retries the
-- scheduled handler — the next run resends the same digest to the
-- same recipient.
--
-- claim_digest_send() flips the order: the route calls this RPC
-- BEFORE dispatching to Resend. The conditional UPDATE only succeeds
-- if last_notified_at is older than p_min_interval (or null). First
-- caller wins; concurrent / retried callers get false and skip.
--
-- Pattern mirrors mark_inquiry_email_sent (021): SECURITY DEFINER
-- with a narrow conditional UPDATE, callable by anon because the
-- cron route uses the anon Supabase client (saved_searches has RLS
-- disabled per its 015 migration — server-side-only table).

CREATE OR REPLACE FUNCTION public.claim_digest_send(
  p_saved_search_id uuid,
  p_min_interval    interval
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE saved_searches
     SET last_notified_at = now()
   WHERE id = p_saved_search_id
     AND is_active = true
     AND (last_notified_at IS NULL OR last_notified_at < now() - p_min_interval);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.claim_digest_send(uuid, interval)
  TO anon, authenticated;
