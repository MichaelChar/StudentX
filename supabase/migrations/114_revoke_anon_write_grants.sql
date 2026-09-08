-- ============================================================
-- Migration 114: revoke anon's INSERT/UPDATE/DELETE/TRUNCATE on
-- every public table, except the one anon write that is real.
--
-- Closes issue #496.
--
-- WHAT WAS WRONG. The `anon` role held INSERT, UPDATE, DELETE and
-- TRUNCATE on ~34 public tables. Those grants come from Supabase's
-- ALTER DEFAULT PRIVILEGES: every new table gets them automatically,
-- and RLS is expected to be the actual control.
--
-- For INSERT/UPDATE/DELETE that reasoning holds — PostgREST applies
-- RLS, so a policy-less table denies them. TRUNCATE is the one that
-- does not: **TRUNCATE is not subject to row-level security**. A role
-- holding TRUNCATE empties the table regardless of every policy on it.
--
-- WHY IT WAS NOT AN EMERGENCY. PostgREST exposes no TRUNCATE verb, so
-- the anon key alone could not reach it over the REST API. The grant
-- is only reachable by something that can issue arbitrary SQL as anon.
-- That is a latent hole, not an open one — which is why #496 was filed
-- rather than hotfixed. It is also exactly the kind of hole that stops
-- being latent the moment an unrelated component (a SQL console, a
-- connection-string leak, a future PostgREST feature) changes.
--
-- WHY THIS COULD NOT BE SWEPT BEFORE. #496 was left deliberately
-- unswept because the schema also held ~14 tables belonging to `lux`,
-- an abandoned project of Michael's, and this sweep could not safely
-- tell them apart from StudentX's. Migration 113 dropped those, so
-- every remaining public table is StudentX's and the sweep is now
-- unambiguous.
--
-- THE ONE EXCEPTION. `question_reports` genuinely needs anon INSERT:
-- its `anyone_can_insert` policy (roles {anon,authenticated}, check
-- `true`) backs the public "report this question" control on the
-- practice tests, which is reachable while signed out. It is granted
-- back explicitly at the bottom rather than skipped in the loop, so
-- the exception is visible rather than buried in a WHERE clause.
--
-- CHECKED BEFORE WRITING THIS (prod, 2026-09-08):
--   - The only RLS policy admitting anon for a write is
--     question_reports.anyone_can_insert. Every other write policy is
--     {public}-roled but quals on auth.uid(), which anon never has.
--   - No server route writes through the anon client. Five files use
--     both getSupabase() and a write; in four, getSupabase() is used
--     only for reads and the writes go through getSupabaseWithToken()
--     or the service client.
--   - The fifth, src/lib/gigInquiryEmail.js, DOES write
--     gig_inquiries.email_sent through the anon client — but
--     gig_inquiries has RLS on and NO UPDATE policy, so that write is
--     already denied and has always silently affected 0 rows. This
--     migration does not change its behaviour. Filed separately; it is
--     a bug in that file, not a dependency on this grant.
--
-- SELECT IS NOT TOUCHED. Public listing/gig browsing depends on anon
-- reads. Only the four write privileges are revoked.
--
-- THIS IS A POINT-IN-TIME SWEEP. Supabase's default privileges are not
-- changed here, so tables created after this migration will again
-- arrive with anon write grants. Changing ALTER DEFAULT PRIVILEGES
-- would prevent that, but it would also silently change the grants
-- every future table gets — surprising anyone who adds one and finds
-- writes denied for reasons no migration mentions. That trade deserves
-- its own decision, not a side effect of this one.
-- ============================================================

DO $$
DECLARE
  r        record;
  v_count  int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      -- Tables AND views. The first pass filtered to 'r' and left
      -- `listing_rating_summary` (a view) holding all four grants.
      -- Those grants are inert on that particular view — it aggregates
      -- with GROUP BY, so it is not auto-updatable and Postgres rejects
      -- writes to it whatever the grants say — but a future simple view
      -- WOULD be updatable, and a view without security_invoker runs as
      -- its owner, which is how a view becomes an RLS bypass. Sweep
      -- them too rather than leave the shape of that mistake lying
      -- around. ('m' and 'p' are included for the same reason.)
      AND c.relkind IN ('r', 'v', 'm', 'p')
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.%I FROM anon',
      r.relname
    );
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'Revoked anon write grants on % table(s).', v_count;
END $$;

-- The single legitimate anon write: the signed-out "report this
-- question" control on practice tests, backed by the
-- `anyone_can_insert` RLS policy on this table.
GRANT INSERT ON TABLE public.question_reports TO anon;
