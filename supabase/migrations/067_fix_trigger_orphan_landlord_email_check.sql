-- ============================================================
-- Migration 067: Tighten email-based dual-role checks to ignore
-- unlinked (pre-seeded) rows.
--
-- RENUMBERED FROM 051 (was 051_fix_trigger_orphan_landlord_email_check).
-- Two problems, one move:
--
--   1. Number collision. 051_rls_phantom_tables_batch2.sql already owned
--      051, and `supabase start` keys schema_migrations on the filename's
--      leading digits — so a clean-stack apply inserted version 051 twice
--      and died on the PK. That is what broke the migration-check CI job.
--
--   2. Order bug this collision was hiding. 052_security_performance_
--      hardening.sql ALSO does CREATE OR REPLACE on prevent_dual_role,
--      and its copy predates this fix — it has no `auth_user_id IS NOT
--      NULL` guard. Running at 051, this fix landed BEFORE 052, so 052
--      silently reverted it and a clean stack rebuilt the original bug.
--      Prod is unaffected: the functions there do carry the guard,
--      because this was applied out-of-band AFTER 052 (2026-05-17 vs
--      2026-05-13). Moving to 067 makes the file order match the order
--      prod was actually built in.
--
-- Nothing between 053 and 066 touches handle_new_student_user or
-- prevent_dual_role, so 067 is the first safe slot after 052.
--
-- BUG: A student (morneg101@hotmail.com) signed up but
-- handle_new_student_user skipped row creation because a
-- pre-seeded landlord row with the same email existed
-- (landlord_id 0104, auth_user_id = NULL). The prevent_dual_role
-- trigger has the same flaw — its email branch matches unlinked
-- seed data, blocking both the trigger and manual recovery.
--
-- FIX: Add `auth_user_id IS NOT NULL` to every email-only branch
-- in both functions. The auth_user_id equality check already
-- guards the real dual-role case; the email heuristic should only
-- fire for claimed accounts, not administrative seed data.
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
  -- already belongs to a CLAIMED landlord account. Unlinked seed
  -- data (auth_user_id IS NULL) must not block student signups.
  IF EXISTS (
    SELECT 1 FROM public.landlords l
     WHERE lower(l.email) = lower(NEW.email)
       AND l.auth_user_id IS NOT NULL
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

-- ---- 2. Patch prevent_dual_role --------------------------------

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
              AND l.auth_user_id IS NOT NULL
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
              AND s.auth_user_id IS NOT NULL
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
