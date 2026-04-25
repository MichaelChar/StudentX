-- ============================================================
-- Migration 023: Add preferred_locale to landlords.
-- ============================================================
-- The inquiry email (sent when a student submits a contact form)
-- is rendered in either Greek or English. Until now the locale
-- was inferred from the *student's* Accept-Language header, which
-- is wrong — the email is landlord-facing. This migration adds
-- a per-landlord locale preference. Defaults to 'el' since
-- Thessaloniki is a Greek-primary market. Existing landlords
-- get the default; any landlord can change it later via the
-- /landlord/settings page.

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'el'
    CHECK (preferred_locale IN ('el', 'en'));
