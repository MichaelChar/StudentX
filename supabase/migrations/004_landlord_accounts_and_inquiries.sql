-- ============================================================
-- Migration 004: Landlord accounts (Supabase auth) + Inquiries
-- ============================================================

-- 1. Evolve landlords table into proper account records
--    Link to Supabase auth.users for authentication.
ALTER TABLE landlords
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Index for fast auth lookups
CREATE INDEX IF NOT EXISTS idx_landlords_auth_user_id ON landlords(auth_user_id);

-- Trigger: auto-update updated_at on landlords
CREATE TRIGGER trigger_landlords_updated_at
  BEFORE UPDATE ON landlords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- 2. Student inquiries
CREATE TABLE inquiries (
  inquiry_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    TEXT NOT NULL REFERENCES listings(listing_id) ON DELETE CASCADE,
  student_name  TEXT NOT NULL,
  student_email TEXT NOT NULL CHECK (student_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  student_phone TEXT,
  message       TEXT NOT NULL CHECK (char_length(message) >= 10),
  -- Optional: faculty the student attends (helps landlord tailor reply)
  faculty_id    TEXT REFERENCES faculties(faculty_id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'replied', 'closed')),
  replied_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inquiries_listing_id   ON inquiries(listing_id);
CREATE INDEX idx_inquiries_status       ON inquiries(status);
CREATE INDEX idx_inquiries_created_at   ON inquiries(created_at DESC);

-- 3. Row Level Security: landlords can only see inquiries for their own listings
ALTER TABLE inquiries ENABLE ROW LEVEL SECURITY;

-- Public: anyone can insert an inquiry (students submitting contact forms)
CREATE POLICY "Anyone can submit an inquiry"
  ON inquiries FOR INSERT
  WITH CHECK (true);

-- Landlords: can read inquiries for their own listings
CREATE POLICY "Landlords can read their own listing inquiries"
  ON inquiries FOR SELECT
  USING (
    listing_id IN (
      SELECT listing_id FROM listings
      WHERE landlord_id = (
        SELECT landlord_id FROM landlords
        WHERE auth_user_id = auth.uid()
      )
    )
  );

-- Landlords: can update status/replied_at on their own inquiries
CREATE POLICY "Landlords can update their own listing inquiries"
  ON inquiries FOR UPDATE
  USING (
    listing_id IN (
      SELECT listing_id FROM listings
      WHERE landlord_id = (
        SELECT landlord_id FROM landlords
        WHERE auth_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (true);
