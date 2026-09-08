-- ============================================================
-- Migration 117: mark_gig_inquiry_email_sent.
--
-- Fixes issue #503. `src/lib/gigInquiryEmail.js` set gig_inquiries.
-- email_sent through the ANON client:
--
--     const supabase = getSupabase();       -- anon
--     await supabase.from('gig_inquiries')
--       .update({ email_sent: true })
--       .eq('inquiry_id', inquiryId);
--
-- gig_inquiries has RLS enabled and exactly two policies — INSERT and
-- SELECT, both {authenticated}. There is NO UPDATE policy, so that
-- statement matched zero rows. Supabase does not raise on an update
-- filtered away by RLS, and the call site discarded the result, so it
-- failed completely silently. `email_sent` has never been true.
--
-- No impact yet — gig_inquiries has 0 rows in prod, so the path has
-- never run for real. It would have bitten on first use of the gigs
-- inquiry flow.
--
-- This mirrors mark_inquiry_email_sent (migration 021), which solved the
-- identical problem for listing inquiries. The gigs flow was built later
-- and did not inherit the fix. Same shape deliberately: SECURITY
-- DEFINER, service_role only, and idempotent via the `AND email_sent =
-- false` guard so a retry or backfill cannot double-count.
--
-- Note the guard is what makes this safe to call more than once — the
-- listing version does the same with `email_sent_at IS NULL`.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mark_gig_inquiry_email_sent(p_inquiry_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int;
BEGIN
  UPDATE gig_inquiries
     SET email_sent = true
   WHERE inquiry_id = p_inquiry_id
     AND email_sent = false;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  -- Returns whether THIS call flipped it. The listing equivalent returns
  -- void, which is why its own no-op case is invisible; #503 was caused
  -- by exactly that kind of silence, so this one reports.
  RETURN v_updated > 0;
END;
$$;

-- Match mark_inquiry_email_sent's grants exactly: {postgres, service_role}.
--
-- The explicit REVOKE FROM anon, authenticated is load-bearing. This is a
-- new function, so Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- both, and REVOKE ALL FROM PUBLIC does not undo it (PUBLIC is not those
-- roles). Migration 112 shipped that mistake and had to be corrected.
-- Leaving it would hand the anon role a write path to the very column
-- this migration exists to protect.
REVOKE ALL ON FUNCTION public.mark_gig_inquiry_email_sent(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_gig_inquiry_email_sent(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_gig_inquiry_email_sent(uuid) TO service_role;
