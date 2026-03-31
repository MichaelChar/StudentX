-- ============================================================
-- Student Housing Directory — Star Schema
-- Migration 001: Create all tables, constraints, indexes
-- ============================================================

-- 1. Landlords (dimension)
CREATE TABLE landlords (
  landlord_id TEXT PRIMARY KEY CHECK (landlord_id ~ '^\d{4}$'),
  name TEXT NOT NULL,
  contact_info TEXT NOT NULL
);

-- 2. Rent (dimension)
CREATE TABLE rent (
  rent_id SERIAL PRIMARY KEY,
  monthly_price NUMERIC CHECK (monthly_price IS NULL OR monthly_price > 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  bills_included BOOLEAN DEFAULT false,
  deposit NUMERIC DEFAULT 0 CHECK (deposit IS NULL OR deposit >= 0)
);

-- 3. Location (dimension)
CREATE TABLE location (
  location_id SERIAL PRIMARY KEY,
  address TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  lat NUMERIC NOT NULL CHECK (lat BETWEEN 40.55 AND 40.70),
  lng NUMERIC NOT NULL CHECK (lng BETWEEN 22.80 AND 23.05)
);

-- 4. Property types (dimension)
CREATE TABLE property_types (
  property_type_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- 5. Amenities (dimension)
CREATE TABLE amenities (
  amenity_id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- 6. Faculties (reference)
CREATE TABLE faculties (
  faculty_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  university TEXT NOT NULL CHECK (university IN ('AUTH', 'UoM', 'IHU')),
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL
);

-- 7. Listings (fact table)
CREATE TABLE listings (
  listing_id TEXT PRIMARY KEY CHECK (listing_id ~ '^\d{7}$'),
  landlord_id TEXT NOT NULL REFERENCES landlords(landlord_id),
  rent_id INTEGER NOT NULL REFERENCES rent(rent_id),
  location_id INTEGER NOT NULL REFERENCES location(location_id),
  property_type_id INTEGER NOT NULL REFERENCES property_types(property_type_id),
  description TEXT,
  photos TEXT[] DEFAULT '{}',
  sqm INTEGER CHECK (sqm IS NULL OR sqm > 0),
  floor INTEGER,
  source_url TEXT,
  available_from DATE,
  rental_duration TEXT,
  flags JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listing_landlord_id_match CHECK (
    LEFT(listing_id, 4) = landlord_id
  )
);

-- 8. Listing amenities (join table)
CREATE TABLE listing_amenities (
  listing_id TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  amenity_id INTEGER NOT NULL REFERENCES amenities(amenity_id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, amenity_id)
);

-- 9. Faculty distances (precomputed)
CREATE TABLE faculty_distances (
  listing_id TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  faculty_id TEXT NOT NULL REFERENCES faculties(faculty_id) ON DELETE CASCADE,
  walk_minutes INTEGER NOT NULL CHECK (walk_minutes >= 0),
  transit_minutes INTEGER NOT NULL CHECK (transit_minutes >= 0),
  PRIMARY KEY (listing_id, faculty_id)
);

-- ============================================================
-- Indexes for common query patterns
-- ============================================================

CREATE INDEX idx_rent_monthly_price ON rent(monthly_price);
CREATE INDEX idx_location_neighborhood ON location(neighborhood);
CREATE INDEX idx_listings_property_type_id ON listings(property_type_id);
CREATE INDEX idx_listings_landlord_id ON listings(landlord_id);
CREATE INDEX idx_listings_rent_id ON listings(rent_id);
CREATE INDEX idx_listings_location_id ON listings(location_id);
CREATE INDEX idx_listing_amenities_amenity_id ON listing_amenities(amenity_id);
CREATE INDEX idx_faculty_distances_faculty_id ON faculty_distances(faculty_id);

-- ============================================================
-- Trigger: auto-update updated_at on listings
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
