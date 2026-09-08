-- Move every listing_views write behind a SECURITY DEFINER RPC and remove the
-- permissive public write policies (#244, advisor 0024 rls_policy_always_true).
--
-- The table had `FOR INSERT WITH CHECK (true)` and `FOR UPDATE USING (true)`
-- granted to PUBLIC. Because the anon key is public, anyone could set any
-- listing's view_count to any value — view counts feed landlord analytics and
-- the host nav summary, so a competitor could inflate or zero any listing.
--
-- The upsert RPC already existed but was SECURITY INVOKER, which is exactly
-- why those policies had to be so permissive: the function wrote as the
-- caller. Making it DEFINER lets the policies go.

-- 1. Same body, same search_path, now DEFINER so it writes as the owner.
CREATE OR REPLACE FUNCTION public.increment_listing_view(p_listing_id text, p_view_date date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO listing_views (listing_id, view_date, view_count)
  VALUES (p_listing_id, p_view_date, 1)
  ON CONFLICT (listing_id, view_date)
  DO UPDATE SET view_count = listing_views.view_count + 1;
END;
$$;

-- 2. Anon may still CALL it — /api/listings/[id]/view tracks views for signed-out
--    visitors and uses the anon client. Calling is fine; arbitrary writing is not.
REVOKE ALL     ON FUNCTION public.increment_listing_view(text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.increment_listing_view(text, date) TO anon, authenticated;

-- 3. The permissive write policies go.
DROP POLICY IF EXISTS "Public can record views"   ON public.listing_views;
DROP POLICY IF EXISTS "Public can increment views" ON public.listing_views;

-- 4. The anon SELECT existed only so the invoker-side upsert could read the
--    conflicting row. The definer RPC does that as owner, so it is dead.
--    Both remaining readers (/api/landlord/analytics and lib/hostNavSummary)
--    use the TOKEN-SCOPED client and are covered by "Landlords can read own
--    listing views" — checked before dropping this.
DROP POLICY IF EXISTS "Anon can read for upsert" ON public.listing_views;

-- 5. Belt and braces: no direct table write grants left behind.
REVOKE INSERT, UPDATE, DELETE ON public.listing_views FROM anon, authenticated;
