-- Email suppression list driven by Resend webhook events.
--
-- Why: Resend POSTs `email.bounced` and `email.complained` events to our
-- /api/webhooks/resend endpoint. Adding a recipient to this table prevents
-- the send-side helpers (lib/emailSuppressions.js) from re-sending and
-- damaging our sender reputation. Once an address is here it stays here
-- (manual cleanup if a user fixes their inbox and asks to be re-enabled).
--
-- RLS: anon can SELECT (so the email-sending paths, which mostly use the
-- anon client, can check before sending without each path needing its own
-- service-role plumbing). Only service_role can INSERT/UPDATE/DELETE — the
-- webhook handler is the only writer. Email addresses here aren't sensitive
-- (the senders already had them, by definition).

CREATE TABLE IF NOT EXISTS email_suppressions (
  -- Stored lowercase + trimmed at insert time so lookups are deterministic
  -- regardless of how the recipient address was originally spelled.
  email TEXT PRIMARY KEY,

  -- Why we suppressed. Constrained so a typo in webhook handling can't
  -- silently slip a new value past us.
  reason TEXT NOT NULL CHECK (reason IN ('bounced', 'complained')),

  -- For bounces, the kind of bounce ('Permanent', 'Transient', etc. — Resend
  -- forwards SES values verbatim). null for complaints. Useful when manually
  -- triaging whether a soft bounce should be cleared from the list.
  bounce_type TEXT,

  -- The Resend event id, for audit / dedupe if a webhook delivers twice.
  source_event_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;

-- Read access for both anon and authenticated. The send-side helper uses
-- the anon client to check suppressions; this lets it work without each
-- caller needing a service-role client.
CREATE POLICY "Suppression list is publicly readable"
  ON email_suppressions FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies — service_role bypasses RLS, so only
-- the webhook handler (which uses SUPABASE_SERVICE_ROLE_KEY) can write.
