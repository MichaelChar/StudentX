-- ============================================================
-- Migration 102: listing_status + university-distance source
-- ============================================================
--
-- Completes marketplace columns the listing wizard needed while migrations
-- were frozen:
--
--   1. Seed marketplace property types as real reference data (was a
--      service-role upsert on every landlord write).
--   2. listings.listing_status — public visibility ('active' | 'disabled').
--      Default 'active' keeps every existing listing visible; landlords
--      disable via My Listings. Public browse/detail/price paths and
--      createBookingRequest honour this column; landlord surfaces do not.
--   3. listing_university_distances.source — whether a distance was
--      prefilled from the map pin ('computed') or landlord-typed
--      ('landlord'). Existing rows are landlord-entered, so DEFAULT is correct.
--
-- DO NOT apply via the agent — human applies to prod before merge.
-- ============================================================

-- ---------------------------------------------------------------------------
-- (a) Seed marketplace property types
-- ---------------------------------------------------------------------------
INSERT INTO public.property_types (name) VALUES
  ('Entire place'),
  ('Bed in shared room')
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- (b) listings.listing_status
-- ---------------------------------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS listing_status text NOT NULL DEFAULT 'active';

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_listing_status_check;

ALTER TABLE public.listings
  ADD CONSTRAINT listings_listing_status_check
  CHECK (listing_status IN ('active', 'disabled'));

CREATE INDEX IF NOT EXISTS idx_listings_listing_status
  ON public.listings (listing_status);

COMMENT ON COLUMN public.listings.listing_status IS
  'Public visibility: active (browseable/bookable) or disabled (landlord-only). Default active. Migration 102.';

-- ---------------------------------------------------------------------------
-- (c) listing_university_distances.source
-- ---------------------------------------------------------------------------
ALTER TABLE public.listing_university_distances
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'landlord';

ALTER TABLE public.listing_university_distances
  DROP CONSTRAINT IF EXISTS listing_university_distances_source_check;

ALTER TABLE public.listing_university_distances
  ADD CONSTRAINT listing_university_distances_source_check
  CHECK (source IN ('landlord', 'computed'));

COMMENT ON COLUMN public.listing_university_distances.source IS
  'Who supplied the metres: landlord (typed/edited) or computed (map-pin prefill). Migration 102.';
