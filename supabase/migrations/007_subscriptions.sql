-- 007: Subscription plans and Stripe integration
-- Adds subscription tiers, landlord subscriptions, and Stripe metadata

-- Subscription plans reference table
CREATE TABLE subscription_plans (
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

-- Landlord subscriptions
CREATE TABLE subscriptions (
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

CREATE UNIQUE INDEX idx_subscriptions_landlord ON subscriptions(landlord_id)
  WHERE status IN ('active', 'past_due', 'trialing', 'incomplete');

CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);

-- Add stripe_customer_id to landlords for quick lookup
ALTER TABLE landlords ADD COLUMN stripe_customer_id TEXT;

-- Seed default plans
INSERT INTO subscription_plans (plan_id, name, description, monthly_price_cents, annual_price_cents, max_listings, features, sort_order) VALUES
  ('free', 'Free', 'Get started with 1 listing', 0, 0, 1, '{"support": "community"}', 0),
  ('starter', 'Starter', 'For individual landlords', 990, 9900, 5, '{"support": "email", "featured_listings": false, "analytics": "basic"}', 1),
  ('pro', 'Pro', 'For professional landlords', 2490, 24900, 25, '{"support": "priority", "featured_listings": true, "analytics": "advanced"}', 2),
  ('business', 'Business', 'For property managers', 4990, 49900, 100, '{"support": "dedicated", "featured_listings": true, "analytics": "advanced", "api_access": true}', 3);

-- RLS policies for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Anyone can read plans
CREATE POLICY "Plans are publicly readable"
  ON subscription_plans FOR SELECT
  USING (true);

-- Landlords can read their own subscriptions
CREATE POLICY "Landlords can read own subscriptions"
  ON subscriptions FOR SELECT
  USING (
    landlord_id IN (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

-- Service role manages subscriptions (webhooks)
CREATE POLICY "Service role manages subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');
