-- ============================================================
-- Migration 026: Student accounts (Supabase auth) + per-inquiry
-- chat plumbing on the inquiries table.
--
-- Pairs with 027_inquiry_messages.sql, which creates the messages
-- table itself. This migration handles students + the inquiry-side
-- denormalised columns and tightens RLS so only authenticated
-- students can submit inquiries.
-- ============================================================

-- 1. Students table — mirrors the landlord pattern from migration 004.
CREATE TABLE IF NOT EXISTS students (
  student_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id      UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email             TEXT UNIQUE NOT NULL,
  display_name      TEXT NOT NULL,
  preferred_locale  TEXT NOT NULL DEFAULT 'el' CHECK (preferred_locale IN ('el', 'en')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_auth_user_id ON students(auth_user_id);

CREATE TRIGGER trigger_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- A student can read & update only their own row.
CREATE POLICY "Students read own row"
  ON students FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Students update own row"
  ON students FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- INSERT happens through SECURITY DEFINER RPC `create_student_profile`,
-- so no public INSERT policy.

-- 2. Inquiry-side columns for chat.
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS student_user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_unread_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS landlord_unread_count    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inquiries_student_user_id
  ON inquiries(student_user_id);

-- One thread per (listing, student). Partial so legacy anonymous rows
-- (student_user_id IS NULL) don't trip the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inquiries_listing_student
  ON inquiries(listing_id, student_user_id)
  WHERE student_user_id IS NOT NULL;

-- 3. Tighten RLS on inquiries.
--    Drop the legacy public-INSERT policy from migration 004 — anonymous
--    submissions are no longer permitted (the API route enforces auth).
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON inquiries;

-- Authenticated students can insert their own inquiries (sanity belt-and-
-- braces — actual writes still go through the SECURITY DEFINER RPC below,
-- but if a future code path bypasses it, RLS still binds the student.
CREATE POLICY "Students insert own inquiry"
  ON inquiries FOR INSERT
  WITH CHECK (student_user_id = auth.uid());

CREATE POLICY "Students read own inquiries"
  ON inquiries FOR SELECT
  USING (student_user_id = auth.uid());

-- (Existing landlord SELECT/UPDATE policies from migration 004 remain.)

-- 4. SECURITY DEFINER RPC: create student profile after Supabase signUp.
--    Mirrors the landlord profile POST flow but auto-derives display_name
--    from the auth.users metadata if the caller didn't pass one.
CREATE OR REPLACE FUNCTION public.create_student_profile(
  p_display_name     text,
  p_preferred_locale text
)
RETURNS students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user        auth.users%ROWTYPE;
  v_existing    students%ROWTYPE;
  v_locale      text;
  v_name        text;
  v_result      students%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF v_user.id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_existing FROM students WHERE auth_user_id = v_user.id;
  IF v_existing.student_id IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_locale := COALESCE(NULLIF(p_preferred_locale, ''), 'el');
  IF v_locale NOT IN ('el', 'en') THEN
    v_locale := 'el';
  END IF;

  v_name := COALESCE(
    NULLIF(trim(p_display_name), ''),
    NULLIF(v_user.raw_user_meta_data->>'display_name', ''),
    split_part(v_user.email, '@', 1)
  );

  INSERT INTO students (auth_user_id, email, display_name, preferred_locale)
  VALUES (v_user.id, lower(v_user.email), v_name, v_locale)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_student_profile(text, text) TO authenticated;

-- 5. SECURITY DEFINER RPC: start (or resume) an inquiry as a logged-in
--    student. Returns existing inquiry_id if a thread already exists.
--    Caps and rate-limits mirror submit_inquiry; we drop the per-IP rate
--    limit since auth.uid() is now the limiter.
CREATE OR REPLACE FUNCTION public.start_inquiry_authenticated(
  p_listing_id text,
  p_message    text
)
RETURNS TABLE (inquiry_id UUID, is_new BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id        UUID;
  v_student        students%ROWTYPE;
  v_landlord_id    TEXT;
  v_tier           TEXT;
  v_listing_count  INTEGER;
  v_existing_id    UUID;
  v_new_id         UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = 'P0004';
  END IF;

  SELECT * INTO v_student FROM students WHERE auth_user_id = v_user_id;
  IF v_student.student_id IS NULL THEN
    RAISE EXCEPTION 'STUDENT_PROFILE_MISSING' USING ERRCODE = 'P0005';
  END IF;

  IF p_message IS NULL OR length(trim(p_message)) < 10 THEN
    RAISE EXCEPTION 'MESSAGE_TOO_SHORT' USING ERRCODE = 'P0006';
  END IF;

  -- Resume existing thread.
  SELECT i.inquiry_id INTO v_existing_id
  FROM inquiries i
  WHERE i.listing_id = p_listing_id
    AND i.student_user_id = v_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    inquiry_id := v_existing_id;
    is_new := FALSE;
    RETURN NEXT;
    RETURN;
  END IF;

  -- New thread — verify listing + apply free-tier cap.
  SELECT landlord_id INTO v_landlord_id FROM listings WHERE listing_id = p_listing_id FOR UPDATE;
  IF v_landlord_id IS NULL THEN
    RAISE EXCEPTION 'LISTING_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT verified_tier INTO v_tier FROM landlords WHERE landlord_id = v_landlord_id;
  IF v_tier IS NULL OR v_tier = 'none' THEN
    SELECT COUNT(*) INTO v_listing_count FROM inquiries WHERE listing_id = p_listing_id;
    IF v_listing_count >= 10 THEN
      RAISE EXCEPTION 'CAP_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Denormalise student_name/email/message onto the inquiry so the existing
  -- landlord notification email and inbox UI keep working unchanged.
  INSERT INTO inquiries (
    listing_id,
    student_name,
    student_email,
    student_phone,
    message,
    student_user_id
  )
  VALUES (
    p_listing_id,
    v_student.display_name,
    v_student.email,
    NULL,
    trim(p_message),
    v_user_id
  )
  RETURNING inquiries.inquiry_id INTO v_new_id;

  inquiry_id := v_new_id;
  is_new := TRUE;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.start_inquiry_authenticated(text, text) TO authenticated;

-- 6. Drop the legacy anonymous submit_inquiry RPC + grants. With the
--    "Anyone can submit" policy gone and the API route now requiring an
--    authenticated student, the old SECURITY DEFINER path would be a
--    backdoor. Cold-cut, no dual path.
DROP FUNCTION IF EXISTS public.submit_inquiry(text, text, text, text, text, text, text);
