-- Migration 103: promote JSON/event-scanned state to real columns.
--
-- Three earlier workarounds stored queryable state in JSON because migrations
-- were frozen. Payments will need "did the student confirm move-in?" without
-- scanning booking_events; property verification needs status without
-- checklist_json.outcome; public response-time buckets need response_stats_at.
--
-- DO NOT apply via this PR's CI alone for prod — apply to prod before merge
-- (see CLAUDE.md migration ordering). Human apply:
--   supabase db push --linked
--   # or mcp__supabase__apply_migration with the SQL below

-- ============================================================
-- (a) bookings.state: add 'moved_in'
-- ============================================================
-- Constraint name is explicit in migration 100 (bookings_state_check).

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_state_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_state_check
  CHECK (state IN (
    'requested',
    'accepted',
    'confirmed',
    'moved_in',
    'declined',
    'expired',
    'cancelled',
    'disputed'
  ));

-- Backfill: any booking with a move_in_ok audit event is now moved_in.
UPDATE bookings b
   SET state = 'moved_in',
       updated_at = now()
 WHERE b.state = 'confirmed'
   AND EXISTS (
     SELECT 1
       FROM booking_events e
      WHERE e.booking_id = b.booking_id
        AND e.metadata->>'kind' = 'move_in_ok'
   );

-- ============================================================
-- (b) property_verifications.status
-- ============================================================

ALTER TABLE property_verifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE property_verifications
  DROP CONSTRAINT IF EXISTS property_verifications_status_check;
ALTER TABLE property_verifications
  ADD CONSTRAINT property_verifications_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- Backfill from existing signals (verified_at / checklist outcome).
UPDATE property_verifications
   SET status = CASE
     WHEN verified_at IS NOT NULL THEN 'approved'
     WHEN checklist_json->>'outcome' = 'rejected' THEN 'rejected'
     ELSE 'pending'
   END;

CREATE INDEX IF NOT EXISTS idx_property_verifications_status_pending
  ON property_verifications(listing_id)
  WHERE status = 'pending';

-- ============================================================
-- (c) Public SELECT grant: landlords.response_stats_at
-- ============================================================
-- Migration 065 revoked table-level SELECT and allowlists public columns.
-- Migration 101 granted avg_response_ms; this column is required for the
-- public listings join so responseTimeBucket can drop stale stats.

GRANT SELECT (response_stats_at) ON public.landlords TO anon;
