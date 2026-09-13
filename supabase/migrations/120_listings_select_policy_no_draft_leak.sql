-- 120: listings SELECT policy — first attempt (#555). APPLIED AND REVERTED.
--
-- ⛔ THIS MIGRATION BROKE PRODUCTION AND WAS REVERTED BY 121 WITHIN MINUTES.
--    It is kept because prod's schema_migrations records it, so removing the
--    file would make the repo unable to reproduce prod's history. Do not
--    copy this expression. The working version is 123.
--
-- The intent was right and is described in 123. The owner arm was not:
--
--     or landlord_id in (
--       select landlord_id from public.landlords
--       where auth_user_id = (select auth.uid())
--     )
--
-- WHY IT BROKE. Migration 065 revoked anon's SELECT on landlords and granted
-- back only nine public columns; auth_user_id is NOT one of them. Column
-- privileges are enforced against the QUERYING role inside a policy
-- expression, not against the policy's author, so every anonymous read of
-- listings — the whole public directory — failed with:
--
--     42501  permission denied for table landlords
--
-- The failure is total and immediate: it is not "the owner arm returns false
-- for anon", it is "the query errors". Arms 1 and 2 never get a chance.
--
-- THE LESSON, which is the only reason to read this file: a policy expression
-- that touches a second table is subject to that table's column grants for
-- every role the policy applies to. `USING` clauses need testing AS each role
-- (`set local role anon`), not just reasoned about. 123 does that, and 122
-- provides the SECURITY DEFINER helper that makes it possible.

alter policy "Public can read listings" on public.listings
using (
  listing_status = 'active'
  or flags->'admin_live_approved' = 'true'::jsonb
  or landlord_id in (
    select landlord_id
    from public.landlords
    where auth_user_id = (select auth.uid())
  )
);
