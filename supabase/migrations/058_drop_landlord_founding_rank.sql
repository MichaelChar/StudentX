-- 058: Drop the founding-cohort rank infrastructure (added in migration 043)
--
-- The AUSoM Founding Landlord programme has pivoted from a self-serve
-- lead-magnet funnel to manual high-touch DM outreach. The /charter landing
-- page and the two automated welcome emails (founding-five 80% promo +
-- founding-50 "Founding Member" badge) — the only readers of founding_rank —
-- have been removed. No application code references the column anymore.
--
-- The Stripe FOUNDING_FIVE_80 coupon is intentionally kept (codes are now
-- issued by hand); it does not depend on this column.
--
-- ORDERING (IMPORTANT): apply this to prod ONLY AFTER the code that stops
-- selecting founding_rank (this PR) has deployed. Cloudflare deploys on
-- push-to-main with no migration gate, so dropping the column while the old
-- code is still live would 500 the landlord-profile POST. This drop is
-- irreversible — the historical signup-order ranks are not recoverable.

DROP TRIGGER IF EXISTS set_founding_rank_trigger ON landlords;
DROP FUNCTION IF EXISTS set_founding_rank();
DROP INDEX IF EXISTS idx_landlords_founding_rank;
ALTER TABLE landlords DROP COLUMN IF EXISTS founding_rank;
