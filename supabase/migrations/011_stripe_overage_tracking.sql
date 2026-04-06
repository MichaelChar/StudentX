-- 011: Add Stripe overage price tracking for Super Pro metered billing
-- stripe_overage_price_id: the Stripe metered price ID on the plan (used at checkout)
-- stripe_overage_item_id: the Stripe subscription item ID for metered billing (stored per subscription)

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_overage_price_id TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_overage_item_id TEXT;
