-- 010: Migrate to 3-tier pricing model
-- New tiers:
--   Starter  — Free, 1 listing          (plan_id: 'free', renamed to Starter)
--   Pro      — €49/year, 5 listings     (plan_id: 'pro', annual-only)
--   Super Pro— €99/year, 20 listings + €5/mo overage (plan_id: 'super_pro', annual-only)

-- Add overage column for Super Pro metered billing
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS overage_price_cents INTEGER DEFAULT 0;

-- Remove old tiers that no longer exist
DELETE FROM subscription_plans WHERE plan_id IN ('starter', 'business');

-- Update the free plan → now branded "Starter"
UPDATE subscription_plans
SET
  name                  = 'Starter',
  description           = 'Get started with 1 listing — free forever',
  monthly_price_cents   = 0,
  annual_price_cents    = 0,
  max_listings          = 1,
  features              = '{"support": "community"}',
  sort_order            = 0,
  overage_price_cents   = 0
WHERE plan_id = 'free';

-- Replace the Pro plan with new annual-only pricing
UPDATE subscription_plans
SET
  name                  = 'Pro',
  description           = 'For serious landlords — up to 5 listings',
  monthly_price_cents   = 0,
  annual_price_cents    = 4900,
  max_listings          = 5,
  features              = '{"support": "email", "featured_listings": true, "analytics": "basic"}',
  sort_order            = 1,
  stripe_monthly_price_id = NULL,
  overage_price_cents   = 0
WHERE plan_id = 'pro';

-- Insert Super Pro plan
INSERT INTO subscription_plans
  (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order, overage_price_cents)
VALUES
  (
    'super_pro',
    'Super Pro',
    'For property managers — 20 listings + €5/mo per extra',
    0,
    9900,
    20,
    '{"support": "priority", "featured_listings": true, "analytics": "advanced", "overage": true}',
    2,
    500
  )
ON CONFLICT (plan_id) DO UPDATE SET
  name                = EXCLUDED.name,
  description         = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  max_listings        = EXCLUDED.max_listings,
  features            = EXCLUDED.features,
  sort_order          = EXCLUDED.sort_order,
  overage_price_cents = EXCLUDED.overage_price_cents;
