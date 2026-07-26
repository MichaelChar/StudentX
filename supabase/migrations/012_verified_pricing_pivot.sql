-- 012: Verified pricing pivot
-- Replaces the old listing-count-tiered plans (free/pro/super_pro) with a
-- verification-based model: unlimited free listings, paid tiers add a
-- verified badge + search boost instead of gating listing count.

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_tier TEXT DEFAULT 'none'
    CHECK (verified_tier IN ('none', 'verified', 'verified_pro'));

CREATE INDEX IF NOT EXISTS idx_landlords_verified ON landlords(is_verified, verified_tier);

UPDATE subscription_plans SET is_active = false;

INSERT INTO subscription_plans
  (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order, overage_price_cents, is_active)
VALUES
  (
    'verified',
    'Verified',
    'Verified badge + search boost for all your listings',
    0,
    4900,
    999999,
    '{"verified_badge": true, "search_boost": true, "support": "email"}',
    1,
    0,
    true
  ),
  (
    'verified_pro',
    'Verified Pro',
    'Priority placement + analytics dashboard for professionals',
    0,
    9900,
    999999,
    '{"verified_badge": true, "search_boost": true, "priority_placement": true, "analytics": "advanced", "support": "priority"}',
    2,
    0,
    true
  )
ON CONFLICT (plan_id) DO UPDATE SET
  name                = EXCLUDED.name,
  description         = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents  = EXCLUDED.annual_price_cents,
  max_listings        = EXCLUDED.max_listings,
  features            = EXCLUDED.features,
  sort_order          = EXCLUDED.sort_order,
  overage_price_cents = EXCLUDED.overage_price_cents,
  is_active           = EXCLUDED.is_active;

UPDATE subscription_plans
SET
  name           = 'Free',
  description    = 'List unlimited properties — free forever',
  max_listings   = 999999,
  sort_order     = 0,
  is_active      = true
WHERE plan_id = 'free';

UPDATE landlords l
SET
  is_verified   = true,
  verified_tier = s.plan_id
FROM subscriptions s
WHERE s.landlord_id = l.landlord_id
  AND s.plan_id IN ('verified', 'verified_pro')
  AND s.status IN ('active', 'trialing');
