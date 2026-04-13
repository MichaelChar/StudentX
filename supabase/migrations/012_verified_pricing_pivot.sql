-- 012: Pivot to free listing + Verified upsell model
-- All landlords list for free (unlimited). Revenue from Verified (€49/yr, up to 5 properties)
-- and Verified Pro (€99/yr, up to 12 properties, €5/property/month overage).

-- 1. Add verified status fields to landlords
ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_tier TEXT DEFAULT 'none'
    CHECK (verified_tier IN ('none', 'verified', 'verified_pro'));

-- Index for filtering/sorting by verified status
CREATE INDEX IF NOT EXISTS idx_landlords_verified ON landlords(is_verified, verified_tier);

-- 2. Deactivate all old plans (Starter/Pro/Super Pro)
UPDATE subscription_plans SET is_active = false;

-- 3. Insert new Verified plans
INSERT INTO subscription_plans
  (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order, overage_price_cents, is_active)
VALUES
  (
    'verified',
    'Verified',
    'Verified badge + search boost — up to 5 properties',
    0,
    4900,
    5,
    '{"verified_badge": true, "search_boost": true, "support": "email"}',
    1,
    0,
    true
  ),
  (
    'verified_pro',
    'Verified Pro',
    'Priority placement + analytics — up to 12 properties',
    0,
    9900,
    12,
    '{"verified_badge": true, "search_boost": true, "priority_placement": true, "analytics": "advanced", "support": "priority", "overage": true}',
    2,
    500,
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

-- 4. Update the free plan: unlimited listings, still free
UPDATE subscription_plans
SET
  name           = 'Free',
  description    = 'List unlimited properties — free forever',
  max_listings   = 999999,
  sort_order     = 0,
  is_active      = true
WHERE plan_id = 'free';

-- 5. Propagate verified status from active subscriptions to landlords
-- (landlords with active verified/verified_pro subscriptions get flagged)
UPDATE landlords l
SET
  is_verified   = true,
  verified_tier = s.plan_id
FROM subscriptions s
WHERE s.landlord_id = l.landlord_id
  AND s.plan_id IN ('verified', 'verified_pro')
  AND s.status IN ('active', 'trialing');
