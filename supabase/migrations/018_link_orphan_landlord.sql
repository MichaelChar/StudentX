-- Function to link an orphan landlord record (auth_user_id IS NULL) to the
-- calling authenticated user. Matches by email and ensures no other landlord
-- is already linked to this auth user.
CREATE OR REPLACE FUNCTION public.link_orphan_landlord(p_landlord_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE landlords
  SET auth_user_id = auth.uid()
  WHERE landlord_id = p_landlord_id
    AND auth_user_id IS NULL
    AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND NOT EXISTS (
      SELECT 1 FROM landlords WHERE auth_user_id = auth.uid()
    );
END;
$$;
