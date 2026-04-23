-- Migration: 015_saved_searches
-- Creates the saved_searches table for email alert subscriptions.
-- No RLS needed — access is server-side only via unsubscribe_token.

CREATE TABLE IF NOT EXISTS saved_searches (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT        NOT NULL,
  label               TEXT,
  filters             JSONB       NOT NULL,
  -- filters shape: { faculty, minBudget, maxBudget, types[], neighborhoods[], amenities[] }
  frequency           TEXT        NOT NULL DEFAULT 'daily'
                      CHECK (frequency IN ('daily', 'weekly')),
  unsubscribe_token   TEXT        NOT NULL UNIQUE
                      DEFAULT encode(gen_random_bytes(32), 'hex'),
  last_notified_at    TIMESTAMPTZ,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_searches_email_idx
  ON saved_searches(email);

CREATE INDEX IF NOT EXISTS saved_searches_active_freq_idx
  ON saved_searches(is_active, frequency)
  WHERE is_active = true;
