-- ============================================================
-- Migration 100: Accommodation marketplace schema (W1–W3 foundation)
-- ============================================================
--
-- Booking-and-escrow marketplace pivot for /property. This migration
-- lands the data model only — no payment collection yet. Booking state
-- 'confirmed' means the landlord accepted; parties settle offline until
-- W3 wires Stripe.
--
-- Number is deliberately 100 (repo highest file is 068; prod has drift).
-- Jumping to 100 avoids prefix collision with applied-but-untracked
-- prod migrations. Do NOT apply to prod from this worktree without the
-- human apply step documented in the PR.
--
-- Sections:
--   1. listings columns + min/max duration constraints
--   2. landlords phone + response-time stats
--   3. students guest-profile columns
--   4. neighborhoods reference table (seeded from location)
--   5. listing_availability_blocks
--   6. bookings + booking_events
--   7. payouts (fee components now; money movement later)
--   8. property_verifications
--   9. RLS + grants
-- ============================================================


-- ============================================================
-- 1. listings — availability, rooms, fees, house rules
-- ============================================================

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS available_to        DATE,
  ADD COLUMN IF NOT EXISTS bedrooms            SMALLINT,
  ADD COLUMN IF NOT EXISTS bathrooms           SMALLINT,
  ADD COLUMN IF NOT EXISTS agency_fee          NUMERIC,
  ADD COLUMN IF NOT EXISTS video_url           TEXT,
  ADD COLUMN IF NOT EXISTS smoking_allowed     BOOLEAN,
  ADD COLUMN IF NOT EXISTS pets_allowed        BOOLEAN,
  ADD COLUMN IF NOT EXISTS additional_rules    TEXT,
  ADD COLUMN IF NOT EXISTS max_duration_months SMALLINT;

-- Widen min_duration_months from the {1,5,9} enum to a 1..12 range.
--
-- The floor stays at 1, NOT 2. The spec's mid-term positioning implies a
-- 2-month minimum, but "Flexible (1 month)" is a live option in the listing
-- form and `parseMinDuration` in src/app/api/landlord/listings/route.js still
-- accepts 1. A DB floor of 2 would let the API accept a value the database
-- then rejects, 500ing every landlord who picks that option.
--
-- Raising the floor to 2 is a product decision, not a schema one. Make it
-- deliberately alongside the API and form change — not here, and not by
-- silently rewriting existing listings' advertised terms.
ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_min_duration_months_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_min_duration_months_check
  CHECK (
    min_duration_months IS NULL
    OR (min_duration_months >= 1 AND min_duration_months <= 12)
  );

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_max_duration_months_check;

ALTER TABLE listings
  ADD CONSTRAINT listings_max_duration_months_check
  CHECK (
    max_duration_months IS NULL
    OR (
      max_duration_months >= 1
      AND max_duration_months <= 12
      AND (
        min_duration_months IS NULL
        OR max_duration_months >= min_duration_months
      )
    )
  );

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_bedrooms_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_bedrooms_check
  CHECK (bedrooms IS NULL OR bedrooms >= 0);

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_bathrooms_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_bathrooms_check
  CHECK (bathrooms IS NULL OR bathrooms >= 0);

ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_agency_fee_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_agency_fee_check
  CHECK (agency_fee IS NULL OR agency_fee >= 0);

-- available_to must not precede available_from when both set.
ALTER TABLE listings
  DROP CONSTRAINT IF EXISTS listings_available_range_check;
ALTER TABLE listings
  ADD CONSTRAINT listings_available_range_check
  CHECK (
    available_from IS NULL
    OR available_to IS NULL
    OR available_to >= available_from
  );

CREATE INDEX IF NOT EXISTS idx_listings_available_to
  ON listings(available_to)
  WHERE available_to IS NOT NULL;


-- ============================================================
-- 2. landlords — phone (video-call scheduling) + response stats
-- ============================================================

ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS phone              TEXT,
  ADD COLUMN IF NOT EXISTS avg_response_ms    BIGINT,
  ADD COLUMN IF NOT EXISTS response_stats_at  TIMESTAMPTZ;

ALTER TABLE landlords
  DROP CONSTRAINT IF EXISTS landlords_avg_response_ms_check;
ALTER TABLE landlords
  ADD CONSTRAINT landlords_avg_response_ms_check
  CHECK (avg_response_ms IS NULL OR avg_response_ms >= 0);


-- ============================================================
-- 3. students — guest profile shown to host pre-accept
-- ============================================================
-- All nullable: existing students keep working; profile completion is
-- enforced at request-to-book in application code (later workstream).

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS date_of_birth         DATE,
  ADD COLUMN IF NOT EXISTS gender                TEXT,
  ADD COLUMN IF NOT EXISTS nationality           TEXT,
  ADD COLUMN IF NOT EXISTS languages             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS bio                   TEXT,
  ADD COLUMN IF NOT EXISTS home_university       TEXT,
  ADD COLUMN IF NOT EXISTS receiving_university  TEXT,
  ADD COLUMN IF NOT EXISTS receiving_faculty     TEXT,
  ADD COLUMN IF NOT EXISTS funding_source        TEXT;


-- ============================================================
-- 4. neighborhoods — controlled reference (was free-text on location)
-- ============================================================
-- location.neighborhood stays free text for now (no FK) so existing
-- rows and the ingest pipeline keep working. The form select and
-- /api/neighborhoods will read this table instead of DISTINCT.

CREATE TABLE IF NOT EXISTS neighborhoods (
  neighborhood_id  SERIAL PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prod: seed from whatever is already on location. Fresh local stacks
-- have no location rows yet (seed.sql runs after migrations) — seed.sql
-- inserts the same names the seed listings use.
INSERT INTO neighborhoods (name)
SELECT DISTINCT trim(neighborhood)
  FROM location
 WHERE neighborhood IS NOT NULL
   AND trim(neighborhood) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE neighborhoods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read neighborhoods" ON neighborhoods;
CREATE POLICY "Public can read neighborhoods"
  ON neighborhoods FOR SELECT
  TO anon, authenticated
  USING (true);

-- Writes are migration/seed/admin (service_role) only — no insert policy.
GRANT SELECT ON neighborhoods TO anon, authenticated;


-- ============================================================
-- 5. listing_availability_blocks (W1 calendar)
-- ============================================================
-- kind:
--   booked   — confirmed stay occupies the unit
--   pending  — host accepted; dates held for the payment/confirm window
--   blackout — landlord-blocked (maintenance, personal use, etc.)

CREATE TABLE IF NOT EXISTS listing_availability_blocks (
  block_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  kind        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listing_availability_blocks_kind_check
    CHECK (kind IN ('booked', 'pending', 'blackout')),
  CONSTRAINT listing_availability_blocks_range_check
    CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_listing_availability_blocks_listing
  ON listing_availability_blocks(listing_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_listing_availability_blocks_kind
  ON listing_availability_blocks(listing_id, kind);

DROP TRIGGER IF EXISTS trigger_listing_availability_blocks_updated_at
  ON listing_availability_blocks;
CREATE TRIGGER trigger_listing_availability_blocks_updated_at
  BEFORE UPDATE ON listing_availability_blocks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE listing_availability_blocks ENABLE ROW LEVEL SECURITY;

-- Calendar is part of public browse (detail page month-grid).
DROP POLICY IF EXISTS "Public can read availability blocks" ON listing_availability_blocks;
CREATE POLICY "Public can read availability blocks"
  ON listing_availability_blocks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Landlords manage blackouts (and any manual blocks) on their listings.
-- Pending/booked rows are normally written by the booking service path
-- (service_role); landlords may still insert/update/delete their own.
DROP POLICY IF EXISTS "Landlords manage own listing availability blocks"
  ON listing_availability_blocks;
CREATE POLICY "Landlords manage own listing availability blocks"
  ON listing_availability_blocks FOR ALL
  TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON listing_availability_blocks TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON listing_availability_blocks TO authenticated;


-- ============================================================
-- 6. bookings + booking_events (W2 state machine)
-- ============================================================
-- Phase-without-payments states:
--   requested → accepted → confirmed
--        ↓          ↓
--     declined   expired / cancelled
--   confirmed → cancelled | disputed
--
-- 'confirmed' = landlord accepted and parties settle offline.
-- Payment states (paid, moved_in, released, …) arrive with W3.

CREATE TABLE IF NOT EXISTS bookings (
  booking_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id         UUID NOT NULL REFERENCES students(student_id) ON DELETE RESTRICT,
  listing_id         TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE RESTRICT,
  move_in            DATE NOT NULL,
  move_out           DATE NOT NULL,
  monthly_rent       NUMERIC NOT NULL,
  total_stay_value   NUMERIC NOT NULL,
  state              TEXT NOT NULL DEFAULT 'requested',
  last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- State-machine timestamps (nullable until the transition fires).
  -- requested is implied by created_at.
  accepted_at        TIMESTAMPTZ,
  confirmed_at       TIMESTAMPTZ,
  declined_at        TIMESTAMPTZ,
  expired_at         TIMESTAMPTZ,
  cancelled_at       TIMESTAMPTZ,
  disputed_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bookings_state_check
    CHECK (state IN (
      'requested',
      'accepted',
      'confirmed',
      'declined',
      'expired',
      'cancelled',
      'disputed'
    )),
  CONSTRAINT bookings_date_range_check
    CHECK (move_out > move_in),
  CONSTRAINT bookings_monthly_rent_check
    CHECK (monthly_rent > 0),
  CONSTRAINT bookings_total_stay_value_check
    CHECK (total_stay_value > 0)
);

CREATE INDEX IF NOT EXISTS idx_bookings_student_id
  ON bookings(student_id);
CREATE INDEX IF NOT EXISTS idx_bookings_listing_id
  ON bookings(listing_id);
CREATE INDEX IF NOT EXISTS idx_bookings_state
  ON bookings(state);
CREATE INDEX IF NOT EXISTS idx_bookings_last_activity_at
  ON bookings(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_move_in
  ON bookings(move_in);

DROP TRIGGER IF EXISTS trigger_bookings_updated_at ON bookings;
CREATE TRIGGER trigger_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Append-only audit trail for every state transition.
CREATE TABLE IF NOT EXISTS booking_events (
  event_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id   UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  from_state   TEXT,
  to_state     TEXT NOT NULL,
  actor        TEXT NOT NULL,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_events_to_state_check
    CHECK (to_state IN (
      'requested',
      'accepted',
      'confirmed',
      'declined',
      'expired',
      'cancelled',
      'disputed'
    )),
  CONSTRAINT booking_events_from_state_check
    CHECK (
      from_state IS NULL
      OR from_state IN (
        'requested',
        'accepted',
        'confirmed',
        'declined',
        'expired',
        'cancelled',
        'disputed'
      )
    ),
  CONSTRAINT booking_events_actor_check
    CHECK (actor IN ('student', 'landlord', 'system', 'admin'))
);

CREATE INDEX IF NOT EXISTS idx_booking_events_booking_id
  ON booking_events(booking_id, created_at);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_events ENABLE ROW LEVEL SECURITY;

-- ---- bookings RLS -------------------------------------------------
-- Student: read + create own rows. Update own (cancel / dispute).
-- Landlord: read + update bookings against their own listings.
-- Nobody else (no public SELECT).

DROP POLICY IF EXISTS "Students read own bookings" ON bookings;
CREATE POLICY "Students read own bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    student_id IN (
      SELECT student_id FROM students
       WHERE auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Students create own bookings" ON bookings;
CREATE POLICY "Students create own bookings"
  ON bookings FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id IN (
      SELECT student_id FROM students
       WHERE auth_user_id = (SELECT auth.uid())
    )
    AND state = 'requested'
  );

DROP POLICY IF EXISTS "Students update own bookings" ON bookings;
CREATE POLICY "Students update own bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (
    student_id IN (
      SELECT student_id FROM students
       WHERE auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT student_id FROM students
       WHERE auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Landlords read own listing bookings" ON bookings;
CREATE POLICY "Landlords read own listing bookings"
  ON bookings FOR SELECT
  TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Landlords update own listing bookings" ON bookings;
CREATE POLICY "Landlords update own listing bookings"
  ON bookings FOR UPDATE
  TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE ON bookings TO authenticated;

-- ---- booking_events RLS -------------------------------------------
-- Append-only: participants may read and insert events for bookings
-- they can already see. No UPDATE/DELETE policies (and none granted).

DROP POLICY IF EXISTS "Participants read booking events" ON booking_events;
CREATE POLICY "Participants read booking events"
  ON booking_events FOR SELECT
  TO authenticated
  USING (
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
       WHERE b.student_id IN (
         SELECT student_id FROM students
          WHERE auth_user_id = (SELECT auth.uid())
       )
    )
    OR
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
        JOIN listings l ON l.listing_id = b.listing_id
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Participants insert booking events" ON booking_events;
CREATE POLICY "Participants insert booking events"
  ON booking_events FOR INSERT
  TO authenticated
  WITH CHECK (
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
       WHERE b.student_id IN (
         SELECT student_id FROM students
          WHERE auth_user_id = (SELECT auth.uid())
       )
    )
    OR
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
        JOIN listings l ON l.listing_id = b.listing_id
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT ON booking_events TO authenticated;


-- ============================================================
-- 7. payouts (W3 model now; executor later)
-- ============================================================
-- Fee components are persisted at booking time so the Connect migration
-- only changes who executes the transfer. NEVER store bank details here
-- (or anywhere in this shared Supabase project).

CREATE TABLE IF NOT EXISTS payouts (
  payout_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL UNIQUE REFERENCES bookings(booking_id) ON DELETE RESTRICT,
  gross_rent       NUMERIC NOT NULL,
  commission_net   NUMERIC NOT NULL,
  vat              NUMERIC NOT NULL,
  amount           NUMERIC NOT NULL,
  state            TEXT NOT NULL DEFAULT 'pending',
  paid_at          TIMESTAMPTZ,
  reference        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payouts_state_check
    CHECK (state IN ('pending', 'due', 'paid', 'cancelled')),
  CONSTRAINT payouts_gross_rent_check
    CHECK (gross_rent >= 0),
  CONSTRAINT payouts_commission_net_check
    CHECK (commission_net >= 0),
  CONSTRAINT payouts_vat_check
    CHECK (vat >= 0),
  CONSTRAINT payouts_amount_check
    CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_payouts_state
  ON payouts(state);

DROP TRIGGER IF EXISTS trigger_payouts_updated_at ON payouts;
CREATE TRIGGER trigger_payouts_updated_at
  BEFORE UPDATE ON payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Participants may read fee breakdown for their own booking.
-- Writes are service_role / ops only (no authenticated INSERT/UPDATE).
DROP POLICY IF EXISTS "Participants read own booking payouts" ON payouts;
CREATE POLICY "Participants read own booking payouts"
  ON payouts FOR SELECT
  TO authenticated
  USING (
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
       WHERE b.student_id IN (
         SELECT student_id FROM students
          WHERE auth_user_id = (SELECT auth.uid())
       )
    )
    OR
    booking_id IN (
      SELECT b.booking_id
        FROM bookings b
        JOIN listings l ON l.listing_id = b.listing_id
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT ON payouts TO authenticated;


-- ============================================================
-- 8. property_verifications (W4 table early — admin queue later)
-- ============================================================

CREATE TABLE IF NOT EXISTS property_verifications (
  verification_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  method           TEXT NOT NULL,
  verified_by      TEXT,
  verified_at      TIMESTAMPTZ,
  checklist_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_verifications_method_check
    CHECK (method IN ('video_call', 'in_person', 'document', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_property_verifications_listing_id
  ON property_verifications(listing_id);
CREATE INDEX IF NOT EXISTS idx_property_verifications_verified_at
  ON property_verifications(verified_at DESC)
  WHERE verified_at IS NOT NULL;

ALTER TABLE property_verifications ENABLE ROW LEVEL SECURITY;

-- Public may read completed verifications (badge + tooltip on listing).
-- Incomplete rows (verified_at IS NULL) stay service-role only.
DROP POLICY IF EXISTS "Public can read completed property verifications"
  ON property_verifications;
CREATE POLICY "Public can read completed property verifications"
  ON property_verifications FOR SELECT
  TO anon, authenticated
  USING (verified_at IS NOT NULL);

-- Landlords may read verification rows for their own listings
-- (including in-progress), so the host dashboard can show status.
DROP POLICY IF EXISTS "Landlords read own listing verifications"
  ON property_verifications;
CREATE POLICY "Landlords read own listing verifications"
  ON property_verifications FOR SELECT
  TO authenticated
  USING (
    listing_id IN (
      SELECT l.listing_id
        FROM listings l
        JOIN landlords ld ON ld.landlord_id = l.landlord_id
       WHERE ld.auth_user_id = (SELECT auth.uid())
    )
  );

-- Writes are admin/service_role only — no authenticated INSERT/UPDATE.
GRANT SELECT ON property_verifications TO anon, authenticated;
