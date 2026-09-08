-- ============================================================
-- Migration 113: drop the co-located `lux_platform_schema`.
--
-- Closes issue #243. That issue was written as "an unrelated app's
-- tables are co-located in our project" and rated Medium-High for
-- blast radius. The framing turned out to be slightly wrong in a way
-- that made the fix much cheaper than the issue assumed.
--
-- WHAT THESE ACTUALLY ARE. Prod's migration history carries an entry
-- `lux_platform_schema`, applied 2026-04-06 17:40 — the same afternoon
-- as StudentX's own migrations 004-012. Michael confirmed on
-- 2026-09-08 that Lux is a project of his that he no longer runs. It
-- is not a third party's live database, so #243's Step 2 branch
-- "move StudentX to its own Supabase project" does not apply; the
-- "confirmed abandoned, drop them" branch does.
--
-- WHY IT STILL MATTERED. StudentX's SUPABASE_SERVICE_ROLE_KEY bypasses
-- RLS, so a leak of that one key — Worker secret, CI, or a bug in any
-- service-role route — put a table literally named `credentials`
-- (with an `encrypted_data` column) in scope, for a product that has
-- not existed for months. Zero benefit, permanent downside.
--
-- CHECKS RUN BEFORE WRITING THIS (all on prod, 2026-09-08):
--   - Row counts: all 14 tables 0 rows. Re-asserted at the top of this
--     migration so it refuses to run if that ever stops being true.
--   - No foreign keys cross between these tables and StudentX's.
--   - No StudentX code references any of them (src/ is clean).
--   - No views reference them; no triggers or RLS policies on them.
--   - `create_student_profile` and `link_orphan_landlord` matched a
--     naive grep for "users" — both reference auth.users explicitly and
--     neither touches public.users. This is the one genuinely dangerous
--     confusion in this migration: `public.users` (Lux's own rolled
--     auth, with password_hash) is NOT `auth.users` (Supabase Auth,
--     which StudentX depends on completely). Only the former is dropped.
--   - All 8 enum types below are used exclusively by these tables.
--
-- The schema is archived at docs/archive/lux-platform-schema.sql. It
-- never had a migration file in this repo — it was applied out-of-band
-- — so without that archive this drop would erase the only record of
-- the design. There is no data to preserve; every table is empty.
-- ============================================================

-- Refuse to run if anything has written a row since this was written.
-- An empty table is the entire basis for dropping it without ceremony.
--
-- This iterates with to_regclass rather than naming the tables in a
-- static SELECT, and that is not style — it is required. These tables
-- were applied to prod OUT-OF-BAND and never had a migration file, so
-- on a clean stack (which is exactly what migration-check.yml builds
-- with `supabase start`) they DO NOT EXIST. A static
-- `SELECT count(*) FROM public.tenants` would raise
-- "relation does not exist" and fail CI on every future PR.
DO $$
DECLARE
  v_table  text;
  v_count  bigint;
  v_total  bigint := 0;
  v_found  int := 0;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'tenants','users','profiles','prompt_templates','automations',
    'automation_instances','runs','credentials','trigger_logs',
    'support_messages','support_tickets','billing_customers',
    'invoices','report_history'
  ] LOOP
    IF to_regclass('public.' || quote_ident(v_table)) IS NOT NULL THEN
      v_found := v_found + 1;
      EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO v_count;
      v_total := v_total + v_count;
    END IF;
  END LOOP;

  IF v_found = 0 THEN
    RAISE NOTICE 'lux_platform_schema not present (clean stack) - nothing to drop.';
  ELSIF v_total > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop lux_platform_schema: % row(s) across % table(s). These tables were empty when migration 113 was written (2026-09-08). Something now uses them - investigate before dropping.',
      v_total, v_found;
  END IF;
END $$;

-- Children before parents. CASCADE would make the order irrelevant, but
-- it would also silently drop anything that had come to depend on these
-- since. Plain DROP fails loudly instead, which is what we want.
DROP TABLE IF EXISTS public.report_history;
DROP TABLE IF EXISTS public.invoices;
DROP TABLE IF EXISTS public.billing_customers;
DROP TABLE IF EXISTS public.support_messages;
DROP TABLE IF EXISTS public.support_tickets;
DROP TABLE IF EXISTS public.trigger_logs;
DROP TABLE IF EXISTS public.runs;
DROP TABLE IF EXISTS public.automation_instances;
DROP TABLE IF EXISTS public.automations;
DROP TABLE IF EXISTS public.prompt_templates;
DROP TABLE IF EXISTS public.credentials;
DROP TABLE IF EXISTS public.profiles;

-- public.users — Lux's own auth table. NOT auth.users. See header.
DROP TABLE IF EXISTS public.users;

DROP TABLE IF EXISTS public.tenants;

-- Enum types, now unreferenced. Each was used by exactly one dropped
-- table; StudentX uses none of them.
DROP TYPE IF EXISTS public.automation_status;
DROP TYPE IF EXISTS public.invoice_status;
DROP TYPE IF EXISTS public.message_sender;
DROP TYPE IF EXISTS public.run_status;
DROP TYPE IF EXISTS public.tier;
DROP TYPE IF EXISTS public.trigger_source;
DROP TYPE IF EXISTS public.trigger_type;
DROP TYPE IF EXISTS public.user_role;
