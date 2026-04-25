-- ============================================================
-- Migration 021: Make mark_inquiry_email_sent() idempotent.
-- ============================================================
-- The original helper (added in 020) did an unconditional UPDATE,
-- so anyone with a leaked inquiry_id could repeatedly bump
-- email_sent_at to now() and poison any future
-- "WHERE email_sent_at IS NULL" backfill. Restrict the UPDATE to
-- rows that have not yet been marked sent — first call wins,
-- subsequent calls are no-ops.

CREATE OR REPLACE FUNCTION public.mark_inquiry_email_sent(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE inquiries
     SET email_sent_at = now()
   WHERE inquiry_id = p_inquiry_id
     AND email_sent_at IS NULL;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_inquiry_email_sent(uuid)
  TO anon, authenticated;
