-- ============================================================
-- Migration 036: Prevent the same email/auth user from holding
-- BOTH a public.students row AND a public.landlords row.
--
-- WHY THIS MATTERS:
-- Both tables have UNIQUE(auth_user_id) and UNIQUE(email) within
-- themselves, but nothing prevents the same user/email from
-- appearing in BOTH. That state silently broke role-routing
-- (requireStudent + requireLandlord both succeed) and was
-- discovered when one production account had ended up in both.
-- The bug arose because two independent paths create rows
-- without consulting the other table:
--   - handle_new_student_user (migrations 029, 030) auto-inserts
--     into students on auth.users INSERT when role='student' or
--     OAuth provider is google/apple.
--   - POST /api/landlord/profile inserts into landlords later,
--     using the same auth_user_id.
--
-- Two pieces below:
--
-- 1. Patch handle_new_student_user to short-circuit when a
--    landlord with the same email already exists. Without this,
--    the BEFORE-INSERT trigger added in step 2 would RAISE
--    inside the auth.users INSERT transaction and abort sign-up
--    entirely if a landlord ever signed in via OAuth (which
--    forces role='student' per migration 030's defense-in-depth
--    branch). Landlord trumps: existing landlords retain their
--    account, the student row is silently skipped.
--
-- 2. prevent_dual_role() — single function, attached to BOTH
--    public.students and public.landlords as BEFORE INSERT OR
--    UPDATE OF auth_user_id, email. It queries the OTHER table
--    for a match on auth_user_id OR (case-folded) email and
--    raises a unique_violation if found. UPDATE-of-email/
--    auth_user_id matters because link_orphan_landlord (used by
--    POST /api/landlord/profile) sets auth_user_id on a
--    previously-NULL landlord row — that path must also be
--    blocked when a students row exists.
--
-- Email comparison is case-insensitive on both sides via lower().
-- Students already pin to lowercase via the CHECK added in
-- migration 033, but landlords don't, so wrapping both sides in
-- lower() is required.
-- ============================================================

-- ---- 1. Patch handle_new_student_user --------------------------

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

  -- Landlord trumps: skip auto-student creation if this email
  -- already belongs to a landlord. The dual-role guard below would
  -- otherwise abort the auth.users INSERT for this user.
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
    v_locale := 'el';
  END IF;

  INSERT INTO public.students (auth_user_id, email, display_name, preferred_locale)
  VALUES (NEW.id, lower(NEW.email), v_display_name, v_locale)
  ON CONFLICT (auth_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---- 2. Generic dual-role guard --------------------------------

CREATE OR REPLACE FUNCTION public.prevent_dual_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conflict_role text;
BEGIN
  IF TG_TABLE_NAME = 'students' THEN
    IF EXISTS (
      SELECT 1 FROM public.landlords l
       WHERE l.auth_user_id = NEW.auth_user_id
          OR (NEW.email IS NOT NULL
              AND l.email IS NOT NULL
              AND lower(l.email) = lower(NEW.email))
    ) THEN
      conflict_role := 'landlord';
    END IF;
  ELSE
    -- public.landlords
    IF EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.auth_user_id = NEW.auth_user_id
          OR (NEW.email IS NOT NULL
              AND s.email IS NOT NULL
              AND lower(s.email) = lower(NEW.email))
    ) THEN
      conflict_role := 'student';
    END IF;
  END IF;

  IF conflict_role IS NOT NULL THEN
    RAISE EXCEPTION
      'Email % already registered as a %; one email cannot be both a student and a landlord',
      NEW.email, conflict_role
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_prevent_dual_role  ON public.students;
DROP TRIGGER IF EXISTS landlords_prevent_dual_role ON public.landlords;

CREATE TRIGGER students_prevent_dual_role
  BEFORE INSERT OR UPDATE OF auth_user_id, email ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dual_role();

CREATE TRIGGER landlords_prevent_dual_role
  BEFORE INSERT OR UPDATE OF auth_user_id, email ON public.landlords
  FOR EACH ROW EXECUTE FUNCTION public.prevent_dual_role();
