# Pending-listings pipeline (consent-gated pre-population)

Ingest housing listings from arbitrary external sites, stage them as **pending
listings** under **pending landlords**, then send each landlord a magic claim
link to publish to the public directory. Also used to migrate the existing fake
seed listings into the same claim flow.

Free to operate: bare `fetch()` + **Cloudflare Workers AI**
(`@cf/meta/llama-3.1-8b-instruct`) for extraction — no external API keys, no paid
scraping service. Storage is the existing **Supabase Postgres + Storage** stack
(not D1/R2 — see migration `059` header for why).

## One-time setup (REQUIRED after merge)

1. **Apply the migration** to prod during PR review (per the CLAUDE.md migration
   ordering convention), e.g. `mcp__supabase__apply_migration` or `supabase db push`.
   Adds `pending_landlords`, `pending_listings` (RLS-locked, service-role only)
   and the public `pending-photos` Storage bucket.

2. **Set the admin allowlist.** Admin access reuses the existing `ADMIN_EMAILS`
   model — and `ADMIN_EMAILS` is currently **not set anywhere** (not in
   `.env*`, `wrangler.jsonc`, or as a Worker secret), so today *every* admin
   route (existing `/admin/metrics`, `/admin/verifications`, and the new ones)
   returns 403/redirect for everyone. Fix it once:

   ```bash
   wrangler secret put ADMIN_EMAILS --name studentx
   # paste: michaelcharlesg@icloud.com
   ```

3. `SUPABASE_SERVICE_ROLE_KEY` must be set as a Worker secret (it already is in
   prod; the pipeline uses it for all pending_* reads/writes). No new secret
   beyond `ADMIN_EMAILS`.

The Workers AI binding (`AI`) is declared in `wrangler.jsonc`; nothing to set.

## Admin surface (`/admin/*`, gated by ADMIN_EMAILS + Supabase session)

- **`/admin/dashboard`** — ingest a single URL or a batch, create pending
  landlords, assign unassigned listings, edit landlord details, and generate a
  claim link.
- **`/admin/migrate-fake-listings`** — the one-time, idempotent fake-listings
  wizard (below).

Ingest marks a listing `needs_manual_entry` when the page is a bot-challenge /
403 / 429 / 5xx / suspiciously short, or when the model returns unparseable
JSON. It never crashes the worker.

> **Workers AI runs only on the Worker.** `getCloudflareContext().env.AI` is
> unavailable in `next dev` (the ingest routes return 503 there). Verify ingest
> on `npm run preview` or after deploy.

## Claim flow (`/claim/:token`, public, token-gated)

The landlord opens the link, reviews/edits their listings, and clicks **Publish
my listings**. Publish moves data into the public star schema: a new `landlords`
row, and per listing a `rent` + `location` + `listings` row (7-digit id minted
with the landlord prefix), copying photos into the public `listing-photos`
bucket. Idempotent — re-clicking is safe. Tokens expire after 30 days.

## Fake-listings migration wizard

`/admin/migrate-fake-listings`:

1. Create up to two pending landlords (or use existing ones).
2. For each fake listing, choose a pending landlord or **Skip / delete**.
3. Click **Migrate**. Assigned listings are staged into `pending_listings`
   (`source_type='migrated_fake'`) and the public listing is hard-deleted;
   skipped listings are just deleted. Summary: `X migrated, Y skipped, Z errors`.

**Protected owners are never shown and never deletable** — resolved server-side
by email/name (michaelcharlesg, plus any landlord literally named
"Superlandlord"). Idempotent via `pending_listings.migrated_from_listing_id`
(UNIQUE): re-running drops already-migrated rows from the grid.

## Notes / limitations

- `pending-photos` is a **public** bucket (like `listing-photos`); object keys
  use unguessable pending ids. The sensitive data (addresses/prices/links) lives
  in the RLS-locked tables, never in object storage. Switch to a private bucket +
  signed URLs if stricter photo privacy is wanted.
- Published listings have **no lat/lng** (we do not geocode at publish), so they
  carry no `faculty_distances` until coordinates are added. They will not appear
  in commute-time-filtered results until then.
- The public `property_types` table has no "3-Bedroom" — pending `3-bed`
  publishes as `2-Bedroom`; `other` publishes as `Studio`.
- Batch ingest processes in the background via `ctx.waitUntil` (capped at 25
  URLs/request); refresh the dashboard to see rows resolve.
