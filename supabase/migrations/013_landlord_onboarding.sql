-- 013: Add onboarding_completed column to landlords table
-- Gates first-time landlord access: landlords who haven't completed onboarding
-- get redirected to /landlord/onboarding. Set to true after Stripe checkout.

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;
