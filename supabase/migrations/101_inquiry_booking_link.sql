-- ============================================================
-- Migration 101: Proper inquiry ↔ booking link + public response-time column
-- ============================================================
--
-- Booking MVP (Wave 3) linked inquiry threads to bookings via
-- booking_events.metadata (kind = 'inquiry_linked') because schema was
-- frozen mid-build. Replace that indirection with a real FK column.
--
-- Also grants landlords.avg_response_ms to anon so /api/listings can
-- rank on the denormalised column (migration 065 deny-by-default; 100
-- added the column but not the grant).
--
-- Number: 101 (100 is highest applied; do not query prod for a number).
-- Do NOT apply from this worktree without the human apply step.
-- ============================================================


-- ============================================================
-- 1. inquiries.booking_id — nullable FK, ON DELETE SET NULL
-- ============================================================

ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS booking_id UUID
  REFERENCES bookings(booking_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inquiries_booking_id
  ON inquiries(booking_id)
  WHERE booking_id IS NOT NULL;


-- ============================================================
-- 2. Backfill from booking_events metadata (kind = 'inquiry_linked')
-- ============================================================
-- Prefer the earliest event per inquiry if duplicates ever existed.

UPDATE inquiries i
   SET booking_id = linked.booking_id
  FROM (
    SELECT DISTINCT ON ((metadata->>'inquiry_id'))
           (metadata->>'inquiry_id')::uuid AS inquiry_id,
           booking_id
      FROM booking_events
     WHERE metadata->>'kind' = 'inquiry_linked'
       AND metadata ? 'inquiry_id'
       AND (metadata->>'inquiry_id') ~* '^[0-9a-f-]{36}$'
     ORDER BY (metadata->>'inquiry_id'), created_at ASC
  ) linked
 WHERE i.inquiry_id = linked.inquiry_id
   AND i.booking_id IS NULL;


-- ============================================================
-- 3. RLS — row policies are unchanged; document the invariant
-- ============================================================
-- inquiries RLS is row-scoped (students see own rows; landlords see
-- rows for their listings). Adding booking_id does not change who can
-- SELECT / INSERT / UPDATE a thread. No policy DROP/CREATE required.
--
-- Application writes to booking_id go through the service role (create
-- booking + link). Participants may read the column under existing
-- SELECT policies. Landlords' existing UPDATE policy can touch any
-- column on their rows (same as before for other fields).


-- ============================================================
-- 4. Public grant: landlords.avg_response_ms for /api/listings ranking
-- ============================================================
-- Migration 065 revoked table-level SELECT from anon and allowlisted
-- public catalog columns only. avg_response_ms landed in 100 without a
-- grant; ranking on the denormalised column needs one.

GRANT SELECT (avg_response_ms) ON public.landlords TO anon;
