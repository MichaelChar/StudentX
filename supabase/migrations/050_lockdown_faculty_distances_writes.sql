-- ============================================================
-- Migration 050: Remove anon write access to faculty_distances.
-- ============================================================
--
-- Migration 048 added temporary anon INSERT/UPDATE policies on
-- faculty_distances because recomputeDistances.js used the anon
-- Supabase client. Now that the function accepts a caller-supplied
-- client (service-role from the cron route, authenticated from
-- landlord listing routes), the anon write policies are no longer
-- needed.
--
-- Replaces them with authenticated-only policies so the landlord
-- token-scoped client can still write. The cron's service-role
-- client bypasses RLS entirely. The public SELECT policy from 048
-- remains unchanged.
-- ============================================================

-- Drop the temporary anon write policies from migration 048
DROP POLICY "Anon can insert faculty_distances" ON faculty_distances;
DROP POLICY "Anon can update faculty_distances" ON faculty_distances;

-- Authenticated policies for landlord listing create/edit routes
CREATE POLICY "Authenticated can insert faculty_distances"
  ON faculty_distances FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update faculty_distances"
  ON faculty_distances FOR UPDATE TO authenticated
  USING (true);
