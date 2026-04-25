-- ============================================================
-- Migration 019: Inquiry rate limiting + email send tracking
-- ============================================================
-- Adds the columns needed by POST /api/inquiries to enforce a
-- per-IP rate limit and to record whether the landlord notification
-- email was successfully sent (for retry/backfill).

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS submitter_ip  TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

-- Used by the rate-limit lookup: count rows by IP within the last hour.
CREATE INDEX IF NOT EXISTS idx_inquiries_submitter_ip_created_at
  ON inquiries (submitter_ip, created_at DESC);
