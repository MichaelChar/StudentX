-- ============================================================
-- Migration 112: link_orphan_landlord requires a CONFIRMED email,
-- and reports whether it actually linked anything.
--
-- Closes the conditional account-takeover in issue #246 (originally
-- raised as issue 4 of docs/security-audit-2026-06-12.md).
--
-- WHAT THE FUNCTION DOES. A landlord row can exist before its owner
-- ever signs up — seeded/curated rows carry an email and a NULL
-- auth_user_id. When someone signs up with that email, this RPC
-- attaches their auth user to the waiting row, handing them that
-- landlord's listings, inbox and PII.
--
-- THE HOLE. Ownership of the row was proved by ONE thing: that the
-- caller's auth.users.email string equals the row's email. Nothing
-- checked that the caller had ever proved they can read that mailbox.
-- So the function's safety rested entirely on the Supabase project
-- having "Confirm email" switched on.
--
-- It IS switched on — verified on prod 2026-09-08: of 15 auth users,
-- 0 were confirmed within 2s of creation (i.e. no autoconfirm) and 3
-- sit unconfirmed. So this is NOT an active exploit.
--
-- But that setting lives in a dashboard, is recorded in no file here,
-- is asserted by no test, and would silently re-open this the moment
-- someone flipped it while debugging signup. A security property that
-- important should be stated in the code that depends on it. Now the
-- WHERE clause says it out loud.
--
-- WHY THE RETURN TYPE CHANGES TOO. The function was `RETURNS void`,
-- so a zero-row UPDATE was indistinguishable from a successful link.
-- The caller (src/app/api/landlord/profile/route.js) checked only for
-- an error and then responded `{ landlord: orphan }` — telling the
-- client it had claimed an account it had not claimed. That was
-- already reachable via the auth_user_id / NOT EXISTS conditions;
-- adding a fourth condition makes it likelier. Returning boolean lets
-- the route tell the two apart, so it can 403 instead of lying.
--
-- CREATE OR REPLACE cannot change a return type, hence the DROP. The
-- old and new forms are both callable as `rpc('link_orphan_landlord',
-- { p_landlord_id })` and the deployed route ignores the return value,
-- so applying this ahead of the consuming PR (as CLAUDE.md requires)
-- is safe in the gap.
-- ============================================================

DROP FUNCTION IF EXISTS public.link_orphan_landlord(text);

CREATE FUNCTION public.link_orphan_landlord(p_landlord_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked int;
BEGIN
  UPDATE landlords
  SET auth_user_id = auth.uid()
  WHERE landlord_id = p_landlord_id
    AND auth_user_id IS NULL
    AND email = (
      -- The added clause is `email_confirmed_at IS NOT NULL`. Matching
      -- on the email alone proves nothing about who controls it.
      SELECT email FROM auth.users
      WHERE id = auth.uid()
        AND email_confirmed_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM landlords WHERE auth_user_id = auth.uid()
    );

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  RETURN v_linked > 0;
END;
$$;

-- Restore exactly the grants the dropped function had: a legitimate app
-- RPC called by a signed-in landlord completing their own profile.
--
-- The explicit REVOKE FROM anon is load-bearing, and was added after the
-- first apply of this migration handed anon EXECUTE. DROP + CREATE makes
-- a NEW function, so Supabase's ALTER DEFAULT PRIVILEGES fires and grants
-- EXECUTE to anon AND authenticated. `REVOKE ALL ... FROM PUBLIC` does
-- not undo that — PUBLIC is not the anon role, and the anon grant is
-- explicit. The old function had no anon grant (the advisor only ever
-- flagged it under the `authenticated` lint), so leaving it would have
-- WIDENED the surface in a migration whose purpose is narrowing it.
--
-- Not exploitable either way — an anon caller has auth.uid() = NULL, so
-- the email subquery yields NULL and the UPDATE matches nothing — but a
-- SECURITY DEFINER function should not be callable by a role that can
-- never have a legitimate reason to call it.
REVOKE ALL ON FUNCTION public.link_orphan_landlord(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_orphan_landlord(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_orphan_landlord(text) TO authenticated;
