-- 009: Listing views tracking for analytics
-- Simple per-day counter to avoid bloating the DB with individual view rows

CREATE TABLE listing_views (
  listing_id TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  view_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  view_count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (listing_id, view_date)
);

CREATE INDEX idx_listing_views_date ON listing_views(view_date DESC);

-- RLS: public can insert (increment), landlords can read their own
ALTER TABLE listing_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert/update views (tracking happens from public listing pages)
CREATE POLICY "Public can record views"
  ON listing_views FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Public can increment views"
  ON listing_views FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Landlords can read view stats for their listings
CREATE POLICY "Landlords can read own listing views"
  ON listing_views FOR SELECT
  USING (
    listing_id IN (
      SELECT l.listing_id FROM listings l
      JOIN landlords ld ON ld.landlord_id = l.landlord_id
      WHERE ld.auth_user_id = auth.uid()
    )
  );

-- Also allow anon read for the public view tracking upsert
CREATE POLICY "Anon can read for upsert"
  ON listing_views FOR SELECT
  TO anon
  USING (true);
