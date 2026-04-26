-- ============================================================
-- Migration 030: Extend handle_new_student_user to also fire on
-- OAuth signups even when the role tag is missing.
--
-- WHY THIS MATTERS:
-- Migration 029 only provisions a students row when
-- raw_user_meta_data->>'role' = 'student'. Email/password signups
-- set that tag from the signup page. The OAuth client also passes
-- data: { role: 'student' } via signInWithOAuth, but if a future
-- code path forgets that option (or Supabase ever stops preserving
-- it through the OAuth round-trip), the user would land logged-in
-- with no profile row and the account page would loop on
-- requireStudent.
--
-- Defense-in-depth: also accept the signup when raw_app_meta_data
-- says the user came in via google/apple. raw_app_meta_data is
-- server-set by GoTrue (not user-controllable), so it's a reliable
-- signal that we're looking at an OAuth student signup. The student
-- callback page POSTs /api/student/profile as a second backstop;
-- between trigger + callback POST + ON CONFLICT DO NOTHING, the
-- students row is guaranteed exactly once on first OAuth login.
-- ============================================================

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
  -- Accept either the explicit role tag (email/password and
  -- properly-tagged OAuth signups) or a known OAuth provider
  -- stamped into app_metadata by GoTrue. Other auth.users inserts
  -- (landlords, admin invites, future SAML/etc.) fall through
  -- unchanged.
  v_role     := NULLIF(NEW.raw_user_meta_data->>'role', '');
  v_provider := NULLIF(NEW.raw_app_meta_data->>'provider', '');
  IF v_role IS DISTINCT FROM 'student'
     AND (v_provider IS NULL OR v_provider NOT IN ('google', 'apple')) THEN
    RETURN NEW;
  END IF;

  -- Mirror create_student_profile's fallback chain so the row from
  -- the trigger and a row from the RPC are byte-identical when both
  -- paths fire. OAuth providers commonly set 'full_name' or 'name'
  -- in user_metadata.
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

-- Trigger definition is unchanged (still AFTER INSERT on auth.users
-- via on_auth_user_created_student from migration 029); only the
-- function body is updated by CREATE OR REPLACE above.
