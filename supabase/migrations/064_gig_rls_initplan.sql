-- ============================================================
-- Migration 064: gig_favorites / gig_inquiries RLS InitPlan fix.
-- ============================================================
--
-- Supabase's performance advisor flags auth_rls_initplan (WARN) on the five
-- policies from migration 062: they call auth.uid() BARE, so Postgres
-- re-evaluates it per row instead of once per query. Wrapping it in a scalar
-- subquery — (SELECT auth.uid()) — makes Postgres hoist it into a one-shot
-- InitPlan. Same fix as migration 063 did for student_favorites; these gig
-- tables were the remaining stragglers.
--
-- Pure performance change: each predicate is otherwise byte-identical to 062,
-- so access semantics (and the policies' roles) are unchanged. SELECT/DELETE
-- use USING; INSERT uses WITH CHECK — matching how they exist today.
-- ============================================================

-- gig_favorites (3 policies; owner resolved via the students subquery)
ALTER POLICY "Students read own gig favorites" ON public.gig_favorites
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Students insert own gig favorites" ON public.gig_favorites
  WITH CHECK (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Students delete own gig favorites" ON public.gig_favorites
  USING (
    student_id IN (
      SELECT student_id FROM students WHERE auth_user_id = (SELECT auth.uid())
    )
  );

-- gig_inquiries (2 policies; owner is student_user_id directly)
ALTER POLICY "Authenticated users can submit gig inquiries" ON public.gig_inquiries
  WITH CHECK (student_user_id = (SELECT auth.uid()));

ALTER POLICY "Students read own gig inquiries" ON public.gig_inquiries
  USING (student_user_id = (SELECT auth.uid()));
