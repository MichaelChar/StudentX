-- ============================================================
-- Migration 127: Replace a listing's university distances atomically
-- ============================================================
--
-- Why this exists
-- ---------------
-- writeUniversityDistances replaced a listing's rows with two separate
-- PostgREST calls: DELETE, then INSERT. Each call is its own transaction, so:
--
--   * an INSERT that failed (a CHECK violation, a dropped connection) left the
--     listing with NO university rows. The PDP shows no distances and the
--     listing fails MIN_UNIVERSITY_DISTANCES on its next submit.
--   * two overlapping writers interleaved (delete A, delete B, insert A,
--     insert B), and B's insert hit the primary key.
--
-- Both are more likely since #573/#578, which run re-measures in the
-- background (after() and the heal-university-distances cron), where nobody
-- sees the error.
--
-- One RPC call is one transaction: if the INSERT fails, the DELETE rolls back
-- and the old rows survive. The advisory lock serialises writers per listing,
-- so the second waits for the first and then replaces its rows cleanly: last
-- writer wins, whole set at a time.
--
-- SECURITY INVOKER, deliberately. The caller's RLS still applies: a landlord's
-- token can only replace rows on their own listings (policy "Landlords can
-- manage distances for their listings"), and the service role bypasses RLS as
-- before. The function adds atomicity, not privilege.
-- ============================================================

CREATE OR REPLACE FUNCTION public.replace_listing_university_distances(
  p_listing_id text,
  p_rows jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('listing_university_distances:' || p_listing_id));

  DELETE FROM listing_university_distances WHERE listing_id = p_listing_id;

  INSERT INTO listing_university_distances (
    listing_id, university_id, distance_meters, source,
    measured_from_lat, measured_from_lng
  )
  SELECT
    p_listing_id,
    r->>'university_id',
    (r->>'distance_meters')::integer,
    r->>'source',
    (r->>'measured_from_lat')::numeric,
    (r->>'measured_from_lng')::numeric
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_listing_university_distances(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_listing_university_distances(text, jsonb) TO authenticated, service_role;
