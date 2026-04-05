-- ============================================================
-- Migration 006: Landlord RLS + auto-cleanup trigger
-- ============================================================

-- 1. Enable RLS on landlords
ALTER TABLE landlords ENABLE ROW LEVEL SECURITY;

-- Public read (needed for listing JOIN queries — landlord name/contact shown to students)
CREATE POLICY "Public can read landlords"
  ON landlords FOR SELECT
  USING (true);

-- Authenticated users can create their own landlord profile
CREATE POLICY "Users can create their own landlord profile"
  ON landlords FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- Landlords can update their own record
CREATE POLICY "Landlords can update their own record"
  ON landlords FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- 2. Trigger: clean up orphaned rent + location rows when a listing is deleted
CREATE OR REPLACE FUNCTION cleanup_listing_orphans()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM rent     WHERE rent_id     = OLD.rent_id;
  DELETE FROM location WHERE location_id = OLD.location_id;
  RETURN OLD;
END;
$$;

CREATE TRIGGER on_listing_delete
  AFTER DELETE ON listings
  FOR EACH ROW EXECUTE FUNCTION cleanup_listing_orphans();
