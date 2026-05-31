-- 057_landlord_profile_photo
--
-- Landlord public-profile feature: adds the profile photo students see on a
-- verified landlord's listing cards and profile page, plus a public storage
-- bucket to hold the uploaded avatars.
--
-- APPLY ORDERING: safe to apply before OR after the consuming code deploys.
-- The listing SELECTs add profile_photo_url only to their MAIN select (the
-- FALLBACK select omits it), so pre-migration the code degrades gracefully
-- (renders a monogram, no 500) rather than breaking. Apply to prod during PR
-- review per CLAUDE.md's migration-ordering convention so the photo actually
-- shows on deploy.

-- 1. The column. Nullable: most landlords won't have a photo (existing accounts,
--    and it's optional at signup), in which case the UI shows a name-initial
--    monogram instead.
alter table public.landlords
  add column if not exists profile_photo_url text;

-- 2. Re-grant anon SELECT on the new column. Migration 056 revoked table-wide
--    anon SELECT on landlords and re-granted a FIXED column list (every column
--    that existed at apply time, except contact_info). A column added LATER is
--    therefore not readable by the anon role until granted explicitly — and the
--    public listings query (api/listings, anon client) joins landlords, so
--    without this grant the main SELECT errors and silently falls back to the
--    no-photo SELECT. contact_info stays revoked.
grant select (profile_photo_url) on public.landlords to anon;

-- 3. Public storage bucket for landlord avatars, mirroring `listing-photos`.
--    Public so the stored getPublicUrl renders in <img>/next-image without a
--    signed URL (public buckets serve reads through the public CDN URL without
--    an RLS SELECT policy, exactly like listing-photos). The listing-photos
--    bucket is created out-of-band on prod (prod migration 013, not in the
--    repo); we create this one in-migration so it's reproducible in the clean
--    CI `supabase start` stack too.
insert into storage.buckets (id, name, public)
values ('landlord-photos', 'landlord-photos', true)
on conflict (id) do nothing;

-- 4. Write/replace/delete scoped to the caller's own {uid}/ folder — the same
--    path-scoping #224 (migration 054) applied to listing-photos, so a signed-in
--    landlord can only touch objects under their own auth.uid() prefix. The
--    browser uploader writes to `${auth.uid()}/...`, so legitimate uploads pass.
drop policy if exists "Landlords can upload profile photos" on storage.objects;
create policy "Landlords can upload profile photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'landlord-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Landlords can update profile photos" on storage.objects;
create policy "Landlords can update profile photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'landlord-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'landlord-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Landlords can delete profile photos" on storage.objects;
create policy "Landlords can delete profile photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'landlord-photos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );
