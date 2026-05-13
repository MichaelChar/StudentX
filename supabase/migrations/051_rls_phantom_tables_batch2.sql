-- ============================================================
-- Migration 051: Enable RLS on remaining phantom tables.
-- ============================================================
--
-- Migration 048 covered 6 phantom tables. These 8 additional
-- tables also exist in production (all empty, 0 rows) but were
-- not created by any StudentX migration. Likely created by a
-- Supabase dashboard integration.
--
-- Enabling RLS with no policies blocks all anon/authenticated
-- access (fail-closed). service_role bypasses RLS and remains
-- unaffected.
-- ============================================================

ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS automation_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS trigger_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS support_messages ENABLE ROW LEVEL SECURITY;
