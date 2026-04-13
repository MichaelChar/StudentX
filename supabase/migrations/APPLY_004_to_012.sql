-- ============================================================
-- Combined migrations 004-012 for StudentX
-- Paste this entire file into the Supabase SQL Editor and run.
-- ============================================================

-- ============================================================
-- 004: Landlord accounts (Supabase auth) + Inquiries
-- ============================================================

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_landlords_auth_user_id ON landlords(auth_user_id);

CREATE TRIGGER trigger_landlords_updated_at
  BEFORE UPDATE ON landlords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS inquiries (
  inquiry_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  student_name  TEXT NOT NULL,
  student_email TEXT NOT NULL CHECK (student_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  student_phone TEXT,
  message       TEXT NOT NULL CHECK (char_length(message) >= 10),
  faculty_id    TEXT REFERENCES faculties(faculty_id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'replied', 'closed')),
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_listing_id   ON inquiries(listing_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_status       ON inquiries(status);
CREATE INDEX IF NOT EXISTS idx_inquiries_created_at   ON inquiries(created_at DESC);

ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an inquiry"
  ON inquiries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Landlords can read their own listing inquiries"
  ON inquiries FOR SELECT
  USING (
    listing_id IN (
      SELECT listing_id FROM listings
      WHERE landlord_id = (
        SELECT landlord_id FROM landlords
        WHERE auth_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Landlords can update their own listing inquiries"
  ON inquiries FOR UPDATE
  USING (
    listing_id IN (
      SELECT listing_id FROM listings
      WHERE landlord_id = (
        SELECT landlord_id FROM landlords
        WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (true);

-- ============================================================
-- 005: Row Level Security for listings
-- ============================================================

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read listings"
  ON listings FOR SELECT
  USING (true);

CREATE POLICY "Landlords can insert their own listings"
  ON listings FOR INSERT
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Landlords can update their own listings"
  ON listings FOR UPDATE
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Landlords can delete their own listings"
  ON listings FOR DELETE
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

ALTER TABLE listing_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read listing_amenities"
  ON listing_amenities FOR SELECT USING (true);

CREATE POLICY "Landlords can manage their own listing amenities"
  ON listing_amenities FOR ALL
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  );

ALTER TABLE rent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read rent"
  ON rent FOR SELECT USING (true);

CREATE POLICY "Landlords can manage rent for their listings"
  ON rent FOR ALL
  USING (
    rent_id IN (
      SELECT l.rent_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

ALTER TABLE location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read location"
  ON location FOR SELECT USING (true);

CREATE POLICY "Landlords can manage location for their listings"
  ON location FOR ALL
  USING (
    location_id IN (
      SELECT l.location_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- ============================================================
-- 006: Landlord RLS + auto-cleanup trigger
-- ============================================================

ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read landlords"
  ON landlords FOR SELECT
  USING (true);

CREATE POLICY "Users can create their own landlord profile"
  ON landlords FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Landlords can update their own record"
  ON landlords FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE OR REPLACE FUNCTION cleanup_listing_orphans()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rent     WHERE rent_id     = OLD.rent_id;
  DELETE FROM location WHERE location_id = OLD.location_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_listing_delete
  AFTER DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION cleanup_listing_orphans();

-- ============================================================
-- 007: Subscription plans and Stripe integration
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  plan_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_cents INTEGER NOT NULL,
  annual_price_cents INTEGER NOT NULL,
  max_listings INTEGER NOT NULL,
  features JSONB DEFAULT '{}',
  stripe_monthly_price_id TEXT,
  stripe_annual_price_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id TEXT NOT NULL REFERENCES landlords(landlord_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(plan_id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'past_due', 'canceled', 'incomplete', 'trialing')),
  billing_interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_landlord ON subscriptions(landlord_id)
  WHERE status IN ('active', 'past_due', 'trialing', 'incomplete');

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

ALTER TABLE landlords ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

INSERT INTO subscription_plans (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order) VALUES
  ('free', 'Free', 'Get started with 1 listing', 0, 0, 1, '{"support": "community"}', 0),
  ('starter', 'Starter', 'For individual landlords', 990, 9900, 5, '{"support": "email", "featured_listings": false, "analytics": "basic"}', 1),
  ('pro', 'Pro', 'For professional landlords', 2490, 24900, 25, '{"support": "priority", "featured_listings": true, "analytics": "advanced"}', 2),
  ('business', 'Business', 'For property managers', 4990, 49900, 100, '{"support": "dedicated", "featured_listings": true, "analytics": "advanced", "api_access": true}', 3)
ON CONFLICT (plan_id) DO NOTHING;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Plans are publicly readable"
  ON subscription_plans FOR SELECT
  USING (true);

CREATE POLICY "Landlords can read own subscriptions"
  ON subscriptions FOR SELECT
  USING (
    landlord_id IN (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manages subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 008: Featured listings
-- ============================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_featured ON listings(is_featured DESC);

-- ============================================================
-- 009: Listing views tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS listing_views (
  listing_id TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  view_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (listing_id, view_date)
);

CREATE INDEX IF NOT EXISTS idx_listing_views_date ON listing_views(view_date DESC);

ALTER TABLE listing_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can record views"
  ON listing_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can increment views"
  ON listing_views FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Landlords can read own listing views"
  ON listing_views FOR SELECT
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Anon can read for upsert"
  ON listing_views FOR SELECT
  TO anon
  USING (true);

-- ============================================================
-- 010: 3-tier pricing model
-- ============================================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS overage_price_cents INTEGER DEFAULT 0;

DELETE FROM subscription_plans WHERE plan_id IN ('starter', 'business');

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

-- ============================================================
-- 011: Stripe overage price tracking
-- ============================================================

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_overage_price_id TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_overage_item_id TEXT;

-- ============================================================
-- 012: Verified pricing pivot
-- ============================================================

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
