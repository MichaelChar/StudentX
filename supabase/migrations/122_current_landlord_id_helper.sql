-- 122: current_landlord_id() — the helper that lets an RLS policy on listings
-- ask "is this the caller's own row?" without the caller needing SELECT on
-- landlords.auth_user_id.
--
-- This exists because of the failure in 120: migration 065 revoked anon's
-- SELECT on landlords except for nine public columns, and a policy subselect
-- reading auth_user_id is checked against the querying role's column grants,
-- so it raised 42501 for every anonymous read. SECURITY DEFINER moves that
-- read inside a function owned by postgres, where the grant question does not
-- arise.
--
-- It is safe to expose. The function is keyed on auth.uid() and selects
-- nothing else, so it can only ever return the CALLER's own landlord_id:
-- anon gets NULL, a signed-in student gets NULL, a landlord gets their own id
-- and no one else's. There is no argument to manipulate. search_path is
-- pinned, per the hardening in 109.
--
-- Additive: no policy changes here. 123 is the consumer.

create or replace function public.current_landlord_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select landlord_id from public.landlords where auth_user_id = auth.uid()
$$;

comment on function public.current_landlord_id() is
  'The calling user''s own landlord_id, or NULL. SECURITY DEFINER because RLS '
  'policies on listings must consult landlords.auth_user_id, which anon may '
  'not SELECT (migration 065) — a policy subselect reading it fails with '
  '42501 for every anonymous read. Keyed on auth.uid(), so it can only ever '
  'return the caller''s own id and leaks nothing to anon (which gets NULL).';

revoke all on function public.current_landlord_id() from public;
grant execute on function public.current_landlord_id() to anon, authenticated, service_role;
