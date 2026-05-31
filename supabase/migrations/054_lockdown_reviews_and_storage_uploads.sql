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
drop policy if exists "reviews_insert_public" on public.reviews;
drop policy if exists "reviews_update_reported" on public.reviews;

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
