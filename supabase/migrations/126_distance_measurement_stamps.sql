-- ============================================================
-- Migration 126: Record where each distance was measured from
-- ============================================================
--
-- Why this exists
-- ---------------
-- A distance row is only true for the two points it was measured between,
-- but neither distance table recorded those points. Nothing could tell a
-- stale row from a fresh one:
--
--   * recomputeMissingDistances filled only ABSENT pairs, so a moved pin kept
--     its old walk times until someone noticed (#573 patched one writer, the
--     PATCH route; its code review found two more holes in that patch).
--   * Moving a faculty (migrations 124, 125) needed a hand-run backfill.
--
-- With the endpoints stamped on the row, "stale" is a comparison, and the
-- cron heals every case the same way, whichever writer caused it.
--
--   faculty_distances            measured_from_* = listing pin
--                                measured_to_*   = faculty point
--   listing_university_distances measured_from_* = listing pin
--
-- University rows have no measured_to: each is the nearest of several
-- campuses. A moved or added campus is picked up by re-measuring, as 124/125
-- did, not by this check.
--
-- Nullable, and deliberately NOT backfilled. NULL means "not verified against
-- the current coordinates". The recompute treats it as stale and re-measures,
-- which stamps the row. On prod that's one /table call for faculty_distances
-- plus one call per listing for university rows, on the next cron run.
-- ============================================================

ALTER TABLE faculty_distances
  ADD COLUMN IF NOT EXISTS measured_from_lat numeric,
  ADD COLUMN IF NOT EXISTS measured_from_lng numeric,
  ADD COLUMN IF NOT EXISTS measured_to_lat   numeric,
  ADD COLUMN IF NOT EXISTS measured_to_lng   numeric;

ALTER TABLE listing_university_distances
  ADD COLUMN IF NOT EXISTS measured_from_lat numeric,
  ADD COLUMN IF NOT EXISTS measured_from_lng numeric;
