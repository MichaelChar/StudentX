-- ============================================================
-- Migration 038: Public listing title
-- ============================================================
-- Adds a landlord-chosen public title to every listing. The title
-- is rendered as the heading on the listing detail page, listing
-- card, landlord dashboard row, and map popup. Required, capped at
-- 80 chars, and trimmed.
--
-- Existing rows are backfilled with their joined location.address
-- (truncated to 80 chars) so the NOT NULL constraint can be applied
-- without breaking the deploy. Landlords can edit later.
--
-- Per CLAUDE.md, apply this BEFORE merging the consuming PR — the
-- Cloudflare Workers Build runs on push-to-main with no migration
-- gate, and the SELECT statements in the deployed code reference
-- `title` directly.
-- ============================================================

-- 1. Add column nullable so the backfill can populate it.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS title TEXT
  CHECK (title IS NULL OR char_length(title) <= 80);

-- 2. Backfill: copy each listing's joined location.address into title
--    for any row that doesn't yet have one. Truncate to 80 chars to
--    satisfy the CHECK above.
UPDATE listings l
SET title = LEFT(loc.address, 80)
FROM location loc
WHERE l.location_id = loc.location_id
  AND l.title IS NULL;

-- 3. Lock it down. NOT NULL + non-empty trim guard.
ALTER TABLE listings ALTER COLUMN title SET NOT NULL;
ALTER TABLE listings ADD CONSTRAINT listings_title_not_blank
  CHECK (char_length(trim(title)) > 0);
