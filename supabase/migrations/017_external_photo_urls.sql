-- Add external_photo_urls column to listings table
-- Used by the URL importer to store remote CDN photo URLs from spiti.gr / xe.gr
-- without re-uploading to Supabase Storage at import time.
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS external_photo_urls text[] NOT NULL DEFAULT '{}';
