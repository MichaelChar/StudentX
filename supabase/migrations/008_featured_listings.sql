-- 008: Featured listings
-- Adds is_featured flag to listings for paid plan landlords

ALTER TABLE listings ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false;

-- Index for efficiently sorting featured listings first
CREATE INDEX idx_listings_featured ON listings(is_featured DESC);
