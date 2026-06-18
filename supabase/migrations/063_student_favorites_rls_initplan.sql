-- ============================================================
-- Migration 063: student_favorites RLS InitPlan fix (#263).
-- ============================================================
--
-- Supabase performance advisor flags auth_rls_initplan (WARN) on the three
-- student_favorites policies from migration 053: they call auth.uid() BARE,
-- so Postgres re-evaluates it per row instead of once per query. Wrapping it
-- in a scalar subquery — (SELECT auth.uid()) — makes Postgres hoist it into a
-- one-shot InitPlan. Every other auth-touching policy in this project already
-- uses this form; these three were the only stragglers.
--
-- Pure performance change: the predicate is otherwise byte-identical to 053,
-- so access semantics are unchanged. SELECT/DELETE policies use USING; the
-- INSERT policy uses WITH CHECK — matching how they exist today.
--
-- (Number is 063: prod's highest applied migration is 062_gig_favorites_and_
-- inquiry_reads as of 2026-06-18, verified via list_migrations. The #263 issue
-- text predates 060–062 and its suggested "060" filename would collide.)
-- ============================================================

ALTER POLICY "Students read own favorites" ON public.student_favorites
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Students insert own favorites" ON public.student_favorites
  WITH CHECK (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Students delete own favorites" ON public.student_favorites
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );
