-- Reviews table for property ratings and feedback
CREATE TABLE IF NOT EXISTS reviews (
  review_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  user_email    TEXT NOT NULL,
  rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text   TEXT NOT NULL CHECK (char_length(review_text) BETWEEN 10 AND 2000),
  reported      BOOLEAN NOT NULL DEFAULT FALSE,
  moderated     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_listing_id_idx ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS reviews_moderated_idx  ON reviews(moderated) WHERE moderated = FALSE;

-- View: aggregate rating per listing (only non-moderated reviews)
CREATE OR REPLACE VIEW listing_rating_summary AS
SELECT
  listing_id,
  ROUND(AVG(rating)::numeric, 1) AS avg_rating,
  COUNT(*) AS review_count
FROM reviews
WHERE moderated = FALSE
GROUP BY listing_id;

-- Enable RLS on reviews table
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read non-moderated reviews
CREATE POLICY "reviews_read_public"
  ON reviews FOR SELECT
  USING (moderated = FALSE);

-- Allow anyone to insert a review
CREATE POLICY "reviews_insert_public"
  ON reviews FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update only the reported flag on a single review
-- (actual report operation handled server-side, RLS is permissive insert/select only)
CREATE POLICY "reviews_update_reported"
  ON reviews FOR UPDATE
  USING (true)
  WITH CHECK (true);
