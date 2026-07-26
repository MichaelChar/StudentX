-- 042: Add verified_tier_rank generated column to landlords
--
-- Enables SQL-level sorting by verification tier via PostgREST's
-- referenced_table(col) ordering syntax. Auto-computes from
-- verified_tier on INSERT/UPDATE.

-- Ensure verified_tier exists. It's created by 012_verified_pricing_pivot.sql,
-- but guard here too in case migration ordering ever changes.
ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS verified_tier TEXT DEFAULT 'none'
    CHECK (verified_tier IN ('none', 'verified', 'verified_pro'));

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS verified_tier_rank SMALLINT
  GENERATED ALWAYS AS (
    CASE verified_tier
      WHEN 'verified_pro' THEN 0
      WHEN 'verified'     THEN 1
      ELSE 2
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_landlords_tier_rank
  ON landlords (verified_tier_rank ASC);
