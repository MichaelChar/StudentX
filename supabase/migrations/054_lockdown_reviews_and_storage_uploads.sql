-- 054_lockdown_reviews_and_storage_uploads
--
-- Security audit findings #3 (reviews) and #4 (storage uploads).
-- SAFE TO APPLY IMMEDIATELY: no application code depends on either policy,
-- and the new storage policy matches what the uploader already does.

-- 1. reviews — the table is currently anon-writable. `reviews_insert_public`
--    lets any holder of the public anon key INSERT rows, and
--    `reviews_update_reported` lets them UPDATE *any* row (USING true /
--    WITH CHECK true). No reviews feature ships yet, so drop both permissive
--    write policies. The moderated-read policy (`reviews_read_public`,
--    USING moderated = false) is intentionally kept. Proper owner/auth-scoped
--    write policies should be added when reviews actually launch.
-- reviews exists on prod (migration 015_reviews) but the repo's migration set
-- can't recreate it in a clean `supabase start` stack (prod/repo drift), and
-- `drop policy if exists` still errors when the *table* is missing (42P01).
-- Guard behind a table-exists check: a no-op in the clean CI stack, the real
-- drop on prod where the table + permissive policies actually exist.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'reviews'
  ) then
    drop policy if exists "reviews_insert_public" on public.reviews;
    drop policy if exists "reviews_update_reported" on public.reviews;
  end if;
end $$;

-- 2. storage listing-photos — the INSERT policy only checked the bucket, not
--    the object path, so any authenticated user could upload (and, with
--    upsert, overwrite) objects under another landlord's "{uid}/" prefix:
--    image defacement / arbitrary public-file hosting. Re-scope INSERT to the
--    caller's own folder, mirroring the existing path-scoped DELETE policy
--    ("Landlords can delete listing photos"). The live uploader already writes
--    under `${auth.uid()}/...`, so legitimate uploads are unaffected.
drop policy if exists "Landlords can upload listing photos" on storage.objects;
create policy "Landlords can upload listing photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
