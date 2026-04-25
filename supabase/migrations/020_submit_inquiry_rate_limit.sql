-- ============================================================
-- Migration 020: Extend submit_inquiry() with submitter_ip + per-IP
-- rate limit, and add mark_inquiry_email_sent() helper.
-- ============================================================
-- Anon clients cannot INSERT/UPDATE inquiries directly (RLS), so all
-- writes for the contact-landlord flow go through SECURITY DEFINER RPCs.

-- ---- submit_inquiry --------------------------------------------------
-- Drop the old 6-arg version so we can change the signature cleanly.
DROP FUNCTION IF EXISTS public.submit_inquiry(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.submit_inquiry(
  p_listing_id    text,
  p_student_name  text,
  p_student_email text,
  p_student_phone text,
  p_message       text,
  p_faculty_id    text,
  p_submitter_ip  text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_landlord_id TEXT;
  v_tier        TEXT;
  v_listing_count  INTEGER;
  v_ip_count       INTEGER;
  v_inquiry_id  UUID;
BEGIN
  -- Locate landlord + lock listing row to serialise concurrent caps.
  SELECT landlord_id INTO v_landlord_id
  FROM listings
  WHERE listing_id = p_listing_id
  FOR UPDATE;

  IF v_landlord_id IS NULL THEN
    RAISE EXCEPTION 'LISTING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Per-IP rate limit: 5 inquiries / hour from the same network.
  IF p_submitter_ip IS NOT NULL AND length(p_submitter_ip) > 0 THEN
    SELECT COUNT(*) INTO v_ip_count
    FROM inquiries
    WHERE submitter_ip = p_submitter_ip
      AND created_at > now() - interval '1 hour';

    IF v_ip_count >= 5 THEN
      RAISE EXCEPTION 'RATE_LIMITED' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  -- Free-tier per-listing cap (10) for unverified landlords.
  SELECT verified_tier INTO v_tier
  FROM landlords
  WHERE landlord_id = v_landlord_id;

  IF v_tier IS NULL OR v_tier = 'none' THEN
    SELECT COUNT(*) INTO v_listing_count
    FROM inquiries
    WHERE listing_id = p_listing_id;

    IF v_listing_count >= 10 THEN
      RAISE EXCEPTION 'CAP_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO inquiries (
    listing_id,
    student_name,
    student_email,
    student_phone,
    message,
    faculty_id,
    submitter_ip
  )
  VALUES (
    p_listing_id,
    p_student_name,
    p_student_email,
    p_student_phone,
    p_message,
    p_faculty_id,
    p_submitter_ip
  )
  RETURNING inquiry_id INTO v_inquiry_id;

  RETURN v_inquiry_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.submit_inquiry(text, text, text, text, text, text, text)
  TO anon, authenticated;

-- ---- mark_inquiry_email_sent ----------------------------------------
-- Records that the landlord notification email was successfully sent.
-- Idempotent: callable multiple times, sets email_sent_at to now() each time.
CREATE OR REPLACE FUNCTION public.mark_inquiry_email_sent(p_inquiry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE inquiries
     SET email_sent_at = now()
   WHERE inquiry_id = p_inquiry_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_inquiry_email_sent(uuid)
  TO anon, authenticated;
