-- ============================================================
-- Migration 048: Enable RLS on faculty_distances and restrict
-- write access to authenticated users.
-- ============================================================
--
-- faculty_distances had no RLS (omitted from migrations 001 and 005).
-- recomputeDistances.js previously used the anon Supabase client to
-- read and write. Now that the function accepts a caller-supplied
-- client (service-role from the cron route, authenticated from
-- landlord listing routes), we can lock down writes.
--
-- Policies added:
--   - Public SELECT so the anon client can still read distances for
--     listing detail pages.
--   - Authenticated INSERT/UPDATE so the landlord token-scoped client
--     can write when creating/editing listings.
--   - The cron route's service-role client bypasses RLS entirely.
-- ============================================================

ALTER TABLE faculty_distances ENABLE ROW LEVEL SECURITY;

-- Public read: listing detail pages fetch distances via the anon client.
CREATE POLICY "Anyone can read faculty_distances"
  ON faculty_distances FOR SELECT TO anon, authenticated
  USING (true);

-- Authenticated write: landlord listing create/edit routes pass a
-- token-scoped client that writes distance rows inline.
CREATE POLICY "Authenticated can insert faculty_distances"
  ON faculty_distances FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update faculty_distances"
  ON faculty_distances FOR UPDATE TO authenticated
  USING (true);
