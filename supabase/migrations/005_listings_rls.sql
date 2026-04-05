-- ============================================================
-- Migration 005: Row Level Security for listings
-- Landlords can only manage their own listings (and related rows).
-- ============================================================

-- ── Listings ──────────────────────────────────────────────
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Public: read all listings (student browsing)
CREATE POLICY "Public can read listings"
  ON listings FOR SELECT
  USING (true);

-- Landlords: insert listings tied to their landlord_id
CREATE POLICY "Landlords can insert their own listings"
  ON listings FOR INSERT
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

-- Landlords: update their own listings
CREATE POLICY "Landlords can update their own listings"
  ON listings FOR UPDATE
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

-- Landlords: delete their own listings
CREATE POLICY "Landlords can delete their own listings"
  ON listings FOR DELETE
  USING (
    landlord_id = (
      SELECT landlord_id FROM landlords WHERE auth_user_id = auth.uid()
    )
  );

-- ── listing_amenities ─────────────────────────────────────
ALTER TABLE listing_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read listing_amenities"
  ON listing_amenities FOR SELECT USING (true);

CREATE POLICY "Landlords can manage their own listing amenities"
  ON listing_amenities FOR ALL
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  );

-- ── rent ─────────────────────────────────────────────────
ALTER TABLE rent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read rent"
  ON rent FOR SELECT USING (true);

-- Landlords can insert/update/delete rent rows linked to their listings
CREATE POLICY "Landlords can manage rent for their listings"
  ON rent FOR ALL
  USING (
    rent_id IN (
      SELECT l.rent_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);

-- ── location ─────────────────────────────────────────────
ALTER TABLE location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read location"
  ON location FOR SELECT USING (true);

CREATE POLICY "Landlords can manage location for their listings"
  ON location FOR ALL
  USING (
    location_id IN (
      SELECT l.location_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (true);
