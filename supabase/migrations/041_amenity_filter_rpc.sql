-- 041: RPC for AND-filtering listings by amenity names
--
-- Pushes the "has ALL of these amenities" filter from JS post-fetch
-- into a SQL function callable via supabase.rpc(). The route chains
-- the returned listing_id set with .in() on the existing PostgREST
-- query, so only qualifying rows are fetched.

CREATE OR REPLACE FUNCTION public.listings_with_all_amenities(
  p_amenity_names TEXT[]
)
RETURNS TABLE (listing_id TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT la.listing_id
  FROM listing_amenities la
  JOIN amenities a ON a.amenity_id = la.amenity_id
  WHERE lower(a.name) = ANY (
    SELECT lower(unnest) FROM unnest(p_amenity_names)
  )
  GROUP BY la.listing_id
  HAVING count(DISTINCT lower(a.name)) = (
    SELECT count(DISTINCT lower(unnest)) FROM unnest(p_amenity_names)
  )
$function$;

GRANT EXECUTE ON FUNCTION public.listings_with_all_amenities(TEXT[])
  TO anon, authenticated;
