-- 012: Pivot to free listings + Verified upsell model
-- All landlords get unlimited free listings.
-- Revenue comes from Verified (€49/yr) and Verified Pro (€99/yr) badges.

-- 1. Add verified tier to landlords
ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS verified_tier TEXT NOT NULL DEFAULT 'none'
    CHECK (verified_tier IN ('none', 'verified', 'verified_pro'));

CREATE INDEX IF NOT EXISTS idx_landlords_verified_tier
  ON landlords(verified_tier) WHERE verified_tier != 'none';

-- 2. Deactivate old plans
UPDATE subscription_plans SET is_active = false
WHERE plan_id IN ('free', 'pro', 'super_pro');

-- 3. Insert new verification plans
INSERT INTO subscription_plans
  (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order, is_active)
VALUES
  (
    'verified',
    'Verified',
    'Verified badge + search boost',
    0,
    4900,
    999999,
    '{"verified_badge": true, "search_boost": true}',
    1,
    true
  ),
  (
    'verified_pro',
    'Verified Pro',
    'Priority placement + analytics + verified badge',
    0,
    9900,
    999999,
    '{"verified_badge": true, "search_boost": true, "priority_placement": true, "analytics": "advanced"}',
    2,
    true
  )
ON CONFLICT (plan_id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  max_listings = EXCLUDED.max_listings,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- 4. Keep the free plan active with unlimited listings
UPDATE subscription_plans
SET max_listings = 999999, is_active = true,
    name = 'Free', description = 'List unlimited properties — free forever'
WHERE plan_id = 'free';
