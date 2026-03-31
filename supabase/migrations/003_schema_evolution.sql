-- ============================================================
-- Migration 003: Schema evolution for real-world data
-- Adapts the schema to handle actual scraped listing data
-- ============================================================

-- 1. Evolve listing_id format: XXXX-YY → LLLLLNN (7-digit, no hyphen)
--    Real data uses landlord_id (4 digits) + sequence (3 digits)
ALTER TABLE faculty_distances DROP CONSTRAINT faculty_distances_listing_id_fkey;
ALTER TABLE listing_amenities DROP CONSTRAINT listing_amenities_listing_id_fkey;
ALTER TABLE listings DROP CONSTRAINT listings_listing_id_check;
ALTER TABLE listings DROP CONSTRAINT listing_landlord_id_match;

ALTER TABLE listings ADD CONSTRAINT listings_listing_id_check
  CHECK (listing_id ~ '^\d{7}$');
ALTER TABLE listings ADD CONSTRAINT listing_landlord_id_match
  CHECK (SUBSTRING(listing_id FROM 1 FOR 4) = landlord_id);

ALTER TABLE listing_amenities ADD CONSTRAINT listing_amenities_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id) ON DELETE CASCADE;
ALTER TABLE faculty_distances ADD CONSTRAINT faculty_distances_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES listings(listing_id) ON DELETE CASCADE;

-- 2. Allow nullable prices (many landlords don't publish prices)
ALTER TABLE rent ALTER COLUMN monthly_price DROP NOT NULL;
ALTER TABLE rent DROP CONSTRAINT rent_monthly_price_check;
ALTER TABLE rent ADD CONSTRAINT rent_monthly_price_check
  CHECK (monthly_price IS NULL OR monthly_price > 0);

-- 3. Allow nullable deposit and bills
ALTER TABLE rent ALTER COLUMN deposit DROP NOT NULL;
ALTER TABLE rent ALTER COLUMN bills_included DROP NOT NULL;

-- 4. Add new columns to listings for real-world data
ALTER TABLE listings ADD COLUMN IF NOT EXISTS sqm INTEGER CHECK (sqm IS NULL OR sqm > 0);
ALTER TABLE listings ADD COLUMN IF NOT EXISTS floor INTEGER;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS available_from DATE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS rental_duration TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS flags JSONB DEFAULT '{}';

-- 5. Add new amenities for real-world data
INSERT INTO amenities (name) VALUES
  ('Wi-Fi'),
  ('TV'),
  ('Kitchen'),
  ('Double glazed windows'),
  ('Weekly cleaning'),
  ('Microwave'),
  ('Oven'),
  ('Gas heating'),
  ('Private yard')
ON CONFLICT (name) DO NOTHING;

-- 6. Add new property type
INSERT INTO property_types (name) VALUES
  ('2-Bedroom (x2)')
ON CONFLICT (name) DO NOTHING;
