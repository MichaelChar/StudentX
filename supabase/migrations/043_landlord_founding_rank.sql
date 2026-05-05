-- 043: Founding-cohort rank for landlords
--
-- Tracks signup order for the AUSoM founding-cohort offer (50 founding
-- landlords; the first 5 receive an 80% discount on SuperLandlord). Rank
-- is assigned atomically by a BEFORE INSERT trigger using a transactional
-- advisory lock — gaps from rolled-back transactions are avoided by
-- computing MAX+1 inside the lock rather than relying on a sequence.
--
-- The column is INTEGER (not SERIAL): we want correctness over speed since
-- this fires once per landlord signup (tens of inserts/day at peak).

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS founding_rank INTEGER UNIQUE;

-- Backfill existing landlords in created_at order. created_at is set on
-- every existing row (added in migration 004 with default now()). Falls
-- back to landlord_id sort if created_at is null on any row.
WITH ordered AS (
  SELECT
    landlord_id,
    ROW_NUMBER() OVER (ORDER BY created_at NULLS LAST, landlord_id) AS rn
  FROM landlords
  WHERE founding_rank IS NULL
)
UPDATE landlords l
SET founding_rank = o.rn
FROM ordered o
WHERE l.landlord_id = o.landlord_id;

-- Trigger function: assign next rank atomically. The advisory lock
-- serializes concurrent inserts on this one key only — far cheaper than
-- table-level locking.
CREATE OR REPLACE FUNCTION set_founding_rank()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.founding_rank IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('landlords_founding_rank'));
    SELECT COALESCE(MAX(founding_rank), 0) + 1
      INTO NEW.founding_rank
      FROM landlords;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_founding_rank_trigger ON landlords;
CREATE TRIGGER set_founding_rank_trigger
  BEFORE INSERT ON landlords
  FOR EACH ROW
  EXECUTE FUNCTION set_founding_rank();

CREATE INDEX IF NOT EXISTS idx_landlords_founding_rank
  ON landlords (founding_rank);
