-- ============================================================
-- Migration 118: durable rate limit for /api/listings/report.
--
-- Closes issue #219.
--
-- WHAT WAS WRONG. The report endpoint is unauthenticated and emails the
-- ops inbox on every accepted call. Its only throttle was a module-level
-- JS Map. On Cloudflare Workers each request runs in an ephemeral
-- per-colo isolate that recycles constantly, so that Map is neither
-- global nor durable — it stops button-mashing inside one isolate and
-- nothing more. Spreading requests across isolates/colos would let
-- someone email-bomb ops and burn Resend quota.
--
-- WHY A TABLE AND NOT KV / A DURABLE OBJECT. #219 offers all three.
-- Durable Objects are not available on the Workers Free plan this project
-- runs on (issue #153 is the open decision about upgrading), and adding a
-- KV namespace means new bindings and another piece of infrastructure to
-- keep in sync across wrangler.jsonc and the dashboard. Postgres is
-- already here, already reached from this route's runtime, and gives
-- transactional correctness for free. If #153 ever lands, this can be
-- revisited — but it should not BLOCK on #153.
--
-- WHY AN ADVISORY LOCK. Without it, two concurrent requests from the
-- same IP can both COUNT 2 rows, both decide they are under the limit of
-- 3, and both INSERT — the classic check-then-act race, and precisely
-- the case a distributed attacker produces. pg_advisory_xact_lock keyed
-- on the IP hash serialises same-IP callers for the duration of the
-- transaction and releases automatically. Different IPs never contend,
-- so this does not become a global bottleneck.
--
-- NO RAW IPs ARE STORED. The route passes a SHA-256 hash. A rate limiter
-- needs only a stable bucket key, not the address itself, and this table
-- would otherwise become a standing log of every reporter's IP.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_report_throttle (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip_hash     text        NOT NULL,
  listing_id  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Serves the per-IP window count and the (ip, listing) dedupe probe.
CREATE INDEX IF NOT EXISTS listing_report_throttle_ip_created_idx
  ON public.listing_report_throttle (ip_hash, created_at DESC);

-- Serves the opportunistic GC sweep below.
CREATE INDEX IF NOT EXISTS listing_report_throttle_created_idx
  ON public.listing_report_throttle (created_at);

-- RLS on with NO policies: this table is service_role-only by design, and
-- service_role bypasses RLS. Nothing client-facing may read or write it —
-- it holds abuse-tracking state, not user data.
ALTER TABLE public.listing_report_throttle ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.listing_report_throttle FROM PUBLIC;
REVOKE ALL ON TABLE public.listing_report_throttle FROM anon, authenticated;

/*
  Returns one of:
    'ok'           — recorded; the caller should send the email
    'rate_limited' — this IP is over budget for the window
    'duplicate'    — this IP already reported this listing recently

  'duplicate' is separated from 'rate_limited' so the route can answer
  200 for a repeat report (the reporter sees success; ops gets one email)
  while answering 429 only for genuine flooding.
*/
CREATE OR REPLACE FUNCTION public.check_listing_report_rate_limit(
  p_ip_hash    text,
  p_listing_id text,
  p_max        int      DEFAULT 3,
  p_window     interval DEFAULT interval '10 minutes',
  p_dedupe     interval DEFAULT interval '24 hours'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recent int;
BEGIN
  -- Serialise same-IP callers; see the header for why this is required.
  PERFORM pg_advisory_xact_lock(hashtext(p_ip_hash));

  -- Opportunistic GC. The table only ever holds a rolling day of rows, so
  -- this stays cheap and needs no cron entry. Bounded by the created_at
  -- index. Deliberately runs before the checks so a long-idle table does
  -- not answer from stale rows.
  DELETE FROM listing_report_throttle
   WHERE created_at < now() - GREATEST(p_window, p_dedupe) - interval '1 hour';

  IF EXISTS (
    SELECT 1 FROM listing_report_throttle
     WHERE ip_hash = p_ip_hash
       AND listing_id = p_listing_id
       AND created_at > now() - p_dedupe
  ) THEN
    RETURN 'duplicate';
  END IF;

  SELECT count(*) INTO v_recent
    FROM listing_report_throttle
   WHERE ip_hash = p_ip_hash
     AND created_at > now() - p_window;

  IF v_recent >= p_max THEN
    RETURN 'rate_limited';
  END IF;

  INSERT INTO listing_report_throttle (ip_hash, listing_id)
  VALUES (p_ip_hash, p_listing_id);

  RETURN 'ok';
END;
$$;

-- service_role only. The explicit REVOKE FROM anon, authenticated is
-- load-bearing: CREATE fires Supabase's ALTER DEFAULT PRIVILEGES and
-- grants EXECUTE to both, and REVOKE ALL FROM PUBLIC does not undo that
-- (migration 112 shipped exactly that mistake). A client that could call
-- this could burn its own budget — or, with p_max supplied, hand itself
-- a bigger one.
REVOKE ALL ON FUNCTION public.check_listing_report_rate_limit(text, text, int, interval, interval) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_listing_report_rate_limit(text, text, int, interval, interval) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_listing_report_rate_limit(text, text, int, interval, interval) TO service_role;
