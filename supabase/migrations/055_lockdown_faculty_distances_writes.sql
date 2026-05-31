-- 055_lockdown_faculty_distances_writes
--
-- Security audit finding #6. faculty_distances carried
-- `Authenticated can insert faculty_distances` (WITH CHECK true) and
-- `Authenticated can update faculty_distances` (USING/WITH CHECK true) — any
-- signed-in user could insert or overwrite commute-time rows for any listing,
-- falsifying the walk/transit minutes shown in the directory.
--
-- All legitimate writes now run as the service role: the recompute-distances
-- cron always did, and the inline listing-create/edit recompute was switched
-- to the service-role client in the same PR. The service role bypasses RLS,
-- so these client-facing write policies are no longer needed. The public read
-- policy ("Public can read faculty_distances") is kept.
--
-- ⚠️ APPLY ONLY AFTER the accompanying code (service-role recompute in
--    /api/landlord/listings POST + [id] PATCH) is DEPLOYED. Applying earlier
--    makes the inline recompute fail on create/edit — non-fatal (the listing
--    still saves; the daily cron heals distances), but avoidable.
drop policy if exists "Authenticated can insert faculty_distances" on public.faculty_distances;
drop policy if exists "Authenticated can update faculty_distances" on public.faculty_distances;
