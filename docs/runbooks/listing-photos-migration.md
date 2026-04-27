# Runbook: Migrate listing photos from Wix CDN to Supabase Storage

## Why

12 of 13 production listings hotlink their photos from `static.wixstatic.com`.
That's a single point of failure outside our control:

- If Wix goes down, every listing's gallery breaks.
- If Wix revokes hotlinking from third-party origins (their TOS technically
  forbids it), the same thing happens with no warning.
- og:image previews on Slack / Messenger / WhatsApp / Twitter all break too,
  which kills sharing — our top organic channel.

Migrating the bytes into our own Supabase Storage bucket removes Wix as a
dependency. PR-B (#37) already added the Supabase Storage host to
`next.config.mjs#images.remotePatterns`, so once `listings.photos[]` URLs are
flipped to point at our bucket the gallery and og:image just work — no other
code change needed.

## Pre-flight (one-time): create the Storage bucket

The script does NOT create the bucket — bucket creation needs Dashboard
access and is a one-off. Do it before the first apply run.

1. Open the Supabase Dashboard -> **Storage** -> **New bucket**.
2. Name: `listing-photos`
3. Public bucket: **Yes** (toggle on). Photos are public anyway — we render
   them in `<img>` tags with no auth.
4. File size limit: leave at default (50 MiB is plenty; listing photos are
   typically 50-500 KiB).
5. Allowed MIME types (optional, recommended): `image/jpeg, image/png,
   image/webp, image/avif, image/gif`.
6. Click **Save**.

### Bucket access policy (storage.objects)

The bucket must allow public reads. If you used the Dashboard "Public
bucket" toggle, this is already set. To verify or apply via SQL:

```sql
-- Allow anyone to read objects in listing-photos
CREATE POLICY "Public read on listing-photos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'listing-photos');
```

Writes are performed by the script using the service role key, which
bypasses RLS. No write policy is needed for anon/authenticated users — we
do not want users uploading directly.

## Dry run (always do this first)

```bash
export SUPABASE_URL="https://YOUR-REF.supabase.co"
export SUPABASE_KEY="YOUR-SERVICE-ROLE-KEY"   # NOT the anon key
python3 scripts/migrate_listing_photos.py --dry-run
```

Output you should see:

- `Mode: DRY-RUN (no writes will occur).`
- A line per listing with at least one wixstatic URL.
- For each Wix photo: a `DRY: would upload -> listing-photos/<id>/<n>.<ext>`
  line and a `DRY: would rewrite photos[<n>] -> https://...supabase.co/...`
  line.
- A summary block at the end.

If the dry run fails (network, missing bucket, bad credentials) **stop**
and resolve before applying.

## Apply (live writes)

```bash
export SUPABASE_URL="https://YOUR-REF.supabase.co"
export SUPABASE_KEY="YOUR-SERVICE-ROLE-KEY"
python3 scripts/migrate_listing_photos.py --apply
```

What this does, per Wix photo, in order:

1. Fetches the image (15s timeout, 3 retries with backoff).
2. Determines extension from `Content-Type` (jpg/png/webp/avif/gif; falls
   back to jpg).
3. Uploads to `listing-photos/<listing_id>/<NNN>.<ext>` (NNN = zero-padded
   index in the source `photos[]`).
4. After all photos in a listing succeed, captures the original `photos`
   array to `scripts/migrate_listing_photos.rollback.sql`, then UPDATEs
   `listings.photos` to the new array.

Per-listing atomicity: if any photo within a listing fails, that listing's
DB row is left untouched (you'll see the partial uploads in Storage but
the public URLs still point at Wix until a re-run succeeds).

### Single-listing scope (for testing or fixups)

```bash
python3 scripts/migrate_listing_photos.py --apply --listing 0100001
```

### Override bucket (rare)

```bash
python3 scripts/migrate_listing_photos.py --apply --bucket listing-photos-staging
```

## Verify

After the apply completes, run this against the production database:

```sql
SELECT listing_id, photos
FROM listings
WHERE EXISTS (
  SELECT 1
  FROM unnest(photos) AS u(url)
  WHERE u.url LIKE '%wixstatic.com%'
);
```

Expected: zero rows. If any rows come back, those listings have at least
one photo that failed to migrate — re-run `--apply` (the script is
idempotent and will retry only the unmigrated URLs).

Smoke test the site:

- Open `/listing/0100001` (or any listing) and confirm the gallery loads.
- Use the OpenGraph debugger
  (https://www.opengraph.xyz/url/https%3A%2F%2Fstudentx.gr%2Flisting%2F0100001)
  to confirm og:image points at `*.supabase.co/storage/...` and renders.

## Rollback

The script writes `scripts/migrate_listing_photos.rollback.sql` during
the apply run, with one `UPDATE listings SET photos = ARRAY[...]`
statement per listing it modified, wrapped in a `BEGIN; ... COMMIT;`.

To roll back:

```bash
psql "$DATABASE_URL" -f scripts/migrate_listing_photos.rollback.sql
```

The Storage objects are left in place after rollback — they're orphaned
but harmless and let us re-apply quickly if needed. Delete via the
Dashboard if storage cost matters.

## Idempotency

Re-running `--apply` is safe:

- Photos whose URL is already a `*.supabase.co/storage/...` URL pointing at
  the expected destination are skipped.
- If the destination object exists in Storage with matching byte size, the
  upload is skipped (but the DB row is still rewritten — covers the case
  where a previous run uploaded but crashed before the DB UPDATE).
- The rollback file is regenerated from scratch on each `--apply` run.

## Known limitations / future work

- **New photos added after this migration** that are still hotlinked from
  Wix won't be caught until someone re-runs the script. Future work: add a
  Supabase trigger (or a CI cron) that flags any `listings.photos` value
  containing `wixstatic.com` and either auto-migrates or alerts.
- **The script doesn't delete the Wix source images** — we don't own them
  and can't anyway. They remain on Wix until the original Wix site owner
  removes them.
- **Image dimensions / quality are preserved as-served by Wix.** If we
  later want to thumbnail or re-encode, that's a separate pass.
