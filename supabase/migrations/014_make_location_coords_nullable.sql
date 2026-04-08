-- Make lat/lng nullable since coordinates are optional in the listing form
ALTER TABLE location ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE location ALTER COLUMN lng DROP NOT NULL;

-- Update CHECK constraints to allow NULL values
ALTER TABLE location DROP CONSTRAINT IF EXISTS location_lat_check;
ALTER TABLE location DROP CONSTRAINT IF EXISTS location_lng_check;
ALTER TABLE location ADD CONSTRAINT location_lat_check CHECK (lat IS NULL OR lat BETWEEN 40.55 AND 40.70);
ALTER TABLE location ADD CONSTRAINT location_lng_check CHECK (lng IS NULL OR lng BETWEEN 22.80 AND 23.05);
