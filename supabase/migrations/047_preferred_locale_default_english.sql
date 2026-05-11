-- ============================================================
-- Migration 047: Move preferred_locale's defaults from Greek to English
-- everywhere they live in the schema and trigger code.
-- ============================================================
--
-- Follow-up to migration 046, which only backfilled existing rows. Code
-- review on PR #157 surfaced that several INSERT paths *bypass* the
-- application code that 046's companion changes patched:
--
--   1. landlords.preferred_locale DEFAULT 'el' (migration 023).
--   2. students.preferred_locale DEFAULT 'el' (migration 026).
--   3. handle_new_student_user trigger (latest version in migration 036)
--      writes 'el' when the auth.users row has no preferred_locale hint
--      in metadata. This trigger fires BEFORE the OAuth callback's API
--      POST, so a Google/Apple student signup was getting 'el' written
--      first; the API call would then no-op via the idempotent RPC.
--   4. public.create_student_profile RPC (migration 026) falls back to
--      'el' in its COALESCE. The student signup API forwards 'en'
--      explicitly so this works for password signups, but it would
--      regress if any future caller passed NULL/empty.
--
-- This migration flips all four defaults to 'en'. Together with the
-- email-resolver fallback changes in PR #157, every path from
-- "user gets created" to "user gets emailed" now defaults to English
-- unless explicit Greek is requested (and even that surface is being
-- removed in Step B per issue #158).
--
-- Idempotent: ALTER COLUMN SET DEFAULT is no-op when already 'en';
-- CREATE OR REPLACE FUNCTION is idempotent by definition.

ALTER TABLE landlords
  ALTER COLUMN preferred_locale SET DEFAULT 'en';

ALTER TABLE students
  ALTER COLUMN preferred_locale SET DEFAULT 'en';

-- ---- handle_new_student_user (re-create with 'en' fallback) ---------
-- Mirrors migration 036's version line-for-line, with the v_locale
-- fallback flipped from 'el' to 'en'. Same SECURITY DEFINER context,
-- same dual-role guard, same idempotent INSERT.
CREATE OR REPLACE FUNCTION public.handle_new_student_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text;
  v_provider       text;
  v_display_name   text;
  v_locale         text;
BEGIN
  v_role     := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_provider := NULLIF(NEW.raw_app_meta_data->>'provider', '');
  IF v_role IS DISTINCT FROM 'student'
     AND (v_provider IS NULL OR v_provider NOT IN ('google', 'apple')) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.landlords l
     WHERE lower(l.email) = lower(NEW.email)
  ) THEN
    RETURN NEW;
  END IF;

  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_locale := NULLIF(NEW.raw_user_meta_data->>'preferred_locale', '');
  IF v_locale IS NULL OR v_locale NOT IN ('el', 'en') THEN
    v_locale := 'en';
  END IF;

  INSERT INTO public.students (auth_user_id, email, display_name, preferred_locale)
  VALUES (NEW.id, lower(NEW.email), v_display_name, v_locale)
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---- create_student_profile (re-create with 'en' fallback) ----------
-- TRUE line-for-line mirror of migration 026's body. The ONLY changes
-- are the two `'el'` literals on the locale lines flipped to `'en'`
-- (the COALESCE fallback and the validation re-pin). DECLARE block,
-- auth.users lookup, existing-row early return, three-tier display
-- name fallback chain (p_display_name → raw_user_meta_data display_name
-- → email-local-part), INSERT shape, and grants all stay identical.
-- A prior version of this migration drifted from 026 in ways that
-- silently regressed unrelated behavior (PM review caught it).
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

  v_locale := COALESCE(NULLIF(p_preferred_locale, ''), 'en');
  IF v_locale NOT IN ('el', 'en') THEN
    v_locale := 'en';
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
