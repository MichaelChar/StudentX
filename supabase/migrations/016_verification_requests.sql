-- Migration 016: Landlord verification requests table
-- Stores ID upload requests for manual review and badge assignment

CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id TEXT NOT NULL REFERENCES landlords(landlord_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  id_document_path TEXT NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT
);

CREATE INDEX idx_verification_requests_landlord ON verification_requests(landlord_id);
CREATE INDEX idx_verification_requests_status ON verification_requests(status);
