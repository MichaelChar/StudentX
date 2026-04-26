-- ============================================================
-- Migration 029: Auto-create the students row when a Supabase auth
-- user signs up with role='student' in their metadata.
--
-- WHY THIS MATTERS — the bug we're fixing:
-- When email confirmation is enforced on the Supabase project, the
-- supabase.auth.signUp call returns no immediate session. The signup
-- page can't POST to /api/student/profile (no JWT to authenticate
-- with), so the user clicks the verification email, lands back on
-- /student/login, signs in successfully — and never has a students
-- row. requireStudent then permanently returns null and the account
-- page redirect-loops.
--
-- The fix is the standard Supabase handle_new_user pattern: a
-- SECURITY DEFINER trigger on auth.users that materialises the
-- profile row at signup time (which fires regardless of whether a
-- session is returned). Idempotent via ON CONFLICT so the existing
-- /api/student/profile POST in the signup page can still run as a
-- belt-and-braces fallback for sessions that are returned.
--
-- Pre-paves OAuth: when Google/Apple are wired up later, the same
-- "no immediate session" pathway exists (the user lands back on the
-- redirect URL with a session, but we don't have an opportunity to
-- POST profile metadata mid-flow). With the trigger in place, OAuth
-- signups that include role='student' in the OAuth options data also
-- get a students row automatically.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_student_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role           text;
  v_display_name   text;
  v_locale         text;
BEGIN
  -- Only act when this signup is explicitly a student. Landlord signups
  -- and any other auth.users insert (admin invites, OAuth without a
  -- role tag, etc.) fall through unchanged.
  v_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  IF v_role IS DISTINCT FROM 'student' THEN
    RETURN NEW;
  END IF;

  -- Mirror the fallback chain in create_student_profile so a row from
  -- the trigger and a row from the RPC are byte-identical when both
  -- paths fire (the RPC short-circuits on existing rows, but the
  -- semantics should still match in case the trigger ever runs after
  -- the RPC due to ordering).
  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_locale := NULLIF(NEW.raw_user_meta_data->>'preferred_locale', '');
  IF v_locale IS NULL OR v_locale NOT IN ('el', 'en') THEN
    v_locale := 'el';
  END IF;

  INSERT INTO public.students (auth_user_id, email, display_name, preferred_locale)
  VALUES (NEW.id, lower(NEW.email), v_display_name, v_locale)
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop any prior version (re-apply safety) and install on auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created_student ON auth.users;

CREATE TRIGGER on_auth_user_created_student
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_student_user();
