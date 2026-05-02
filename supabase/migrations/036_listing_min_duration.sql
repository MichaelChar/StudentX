-- Migration: 036_listing_min_duration
-- Replaces the free-text `rental_duration` column with a constrained
-- `min_duration_months` enum (SMALLINT in {1, 5, 9}). Lets students filter
-- results by the minimum commitment a landlord requires:
--   1 = Flexible (1 month)
--   5 = Semester (5 months)
--   9 = Academic year (9 months)
--
-- The old free-text column had no read-side consumer (not displayed anywhere
-- on the student-facing surface, not used by any filter). Existing rows are
-- backfilled to 9 — the modal value for Thessaloniki student rentals — so no
-- listing silently disappears from filtered results post-migration. Landlords
-- who actually take shorter stays will adjust their listing on next edit.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS min_duration_months SMALLINT
  CHECK (min_duration_months IS NULL OR min_duration_months IN (1, 5, 9));

-- Backfill all existing rows to "Academic year" — the modal commitment
-- pattern. Worst case for a 5-month-sublet landlord is one mismatched
-- inquiry from a 9-month student until they update the listing; that
-- resolves through normal messaging.
UPDATE listings
   SET min_duration_months = 9
 WHERE min_duration_months IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_min_duration_months
  ON listings(min_duration_months);

ALTER TABLE listings DROP COLUMN IF EXISTS rental_duration;
