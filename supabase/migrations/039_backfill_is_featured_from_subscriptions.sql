-- 039_backfill_is_featured_from_subscriptions.sql
--
-- After PR-XX, listings.is_featured is no longer a manual landlord toggle —
-- it tracks whether the listing's landlord has an active (or trialing) Stripe
-- subscription. The webhook keeps it in sync going forward; this migration
-- reconciles the existing rows so historic state matches the new model.
--
-- Featured iff the landlord has at least one subscription in status
-- 'active' or 'trialing'. Everything else is set to false.

UPDATE listings
SET is_featured = TRUE
WHERE landlord_id IN (
  SELECT landlord_id
  FROM subscriptions
  WHERE status IN ('active', 'trialing')
);

UPDATE listings
SET is_featured = FALSE
WHERE landlord_id NOT IN (
  SELECT landlord_id
  FROM subscriptions
  WHERE status IN ('active', 'trialing')
);
