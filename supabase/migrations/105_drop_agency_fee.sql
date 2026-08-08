-- Drop listings.agency_fee (directory-era leftover).
--
-- ORDERING (drop-after-deploy):
-- 1. Merge the PR that stops selecting/writing this column.
-- 2. Wait for Cloudflare Workers Build to deploy that code to prod.
-- 3. Only then apply this migration to prod.
--
-- Applying before step 2 will 500 every route that still SELECTs agency_fee.
-- The applied-to-prod CI gate will go red by design for this PR — that is
-- advisory, not blocking (see CLAUDE.md Database section).

ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_agency_fee_check;
ALTER TABLE listings DROP COLUMN IF EXISTS agency_fee;
