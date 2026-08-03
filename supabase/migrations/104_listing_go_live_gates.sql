-- Migration 104: Listing go-live gates
--
-- Public visibility is admin-approved only. Landlord submit never publishes.
-- 1. Default new rows to listing_status = 'disabled' (was 'active').
-- 2. Take offline every currently-public listing that is missing landlord ID
--    verification or a completed property video verification.

-- (a) Default for new inserts
ALTER TABLE public.listings
  ALTER COLUMN listing_status SET DEFAULT 'disabled';

COMMENT ON COLUMN public.listings.listing_status IS
  'Public visibility: active (students can see) | disabled (landlord-only). Default disabled; only admin go-live sets active.';

-- (b) Offline incomplete actives: not both ID-verified landlord AND video-verified listing.
-- Listings already offline are left alone.
UPDATE public.listings l
SET
  listing_status = 'disabled',
  flags = (
    COALESCE(l.flags, '{}'::jsonb)
    || jsonb_build_object(
      'listing_status',
      CASE
        WHEN COALESCE(l.flags->>'listing_status', '') IN ('submitted', 'live')
          THEN 'submitted'
        WHEN COALESCE(l.flags->>'listing_status', '') = 'draft'
          THEN 'draft'
        ELSE 'submitted'
      END,
      'go_live_gate_offline_at', now()::text
    )
  )
    - 'admin_live_approved'
    - 'admin_live_by'
    - 'admin_live_at',
  updated_at = now()
WHERE l.listing_status = 'active'
  AND (
    -- Landlord not ID-verified
    NOT EXISTS (
      SELECT 1
      FROM public.landlords ll
      WHERE ll.landlord_id = l.landlord_id
        AND ll.is_verified = true
    )
    OR
    -- No completed property verification (verified_at set)
    NOT EXISTS (
      SELECT 1
      FROM public.property_verifications pv
      WHERE pv.listing_id = l.listing_id
        AND pv.verified_at IS NOT NULL
    )
  );
