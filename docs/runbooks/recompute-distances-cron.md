# Runbook — Cron: `/api/cron/recompute-distances`

Heals missing rows in `faculty_distances` so newly-added listings (or
listings whose `location.lat/lng` was edited) automatically get
walk/transit minutes to every faculty without anyone having to remember
to run `python3 scripts/compute_distances.py --only-missing` manually.

## What it does

Once a day, the Worker's `scheduled` handler POSTs to
`/api/cron/recompute-distances` with the `x-cron-secret` header. The
route:

1. Fetches every listing (with its joined `location.lat/lng`) and every
   faculty (with `lat/lng`).
2. Pulls every existing `(listing_id, faculty_id)` pair from
   `faculty_distances` (paged through 1000-row chunks to avoid the
   PostgREST default cap).
3. Computes the set of MISSING pairs — pairs whose listing has a
   non-null lat/lng but for which no `faculty_distances` row exists.
4. If the set is empty, returns `{ok: true, computed: 0, ...}` and exits.
5. Otherwise hits OSRM
   `/table/v1/foot/{coords}?sources={listings}&destinations={faculties}&annotations=distance`
   ONCE for the full distance matrix. Coords are the listing points
   followed by the faculty points; sources are the listing indexes,
   destinations the faculty indexes.
6. Converts each missing pair's distance to walk + transit minutes using
   the same pace model as `scripts/compute_distances.py`:

       WALK_M_PER_MIN = 83          # 5 km/h
       BUS_M_PER_MIN  = 250         # ~15 km/h average bus
       BUS_OVERHEAD_MIN = 5         # avg wait + walk-to/from-stop
       walk_minutes    = max(1, ceil(distance_m / WALK_M_PER_MIN))
       transit_minutes = ceil(distance_m / BUS_M_PER_MIN) + BUS_OVERHEAD_MIN

7. UPSERTs into `faculty_distances` with `ignoreDuplicates: true`
   (`ON CONFLICT DO NOTHING`). Existing rows are NOT recomputed —
   re-running cannot change values. Only true gaps get filled.

Returns `{ok: true, computed: N, missingBefore: N, listings: M, faculties: F, unroutable: U}`.

## Cadence

| Cron expression | UTC time | Wired in |
|---|---|---|
| `15 9 * * *` | Daily, 09:15 UTC | [`wrangler.jsonc`](../../wrangler.jsonc) `triggers.crons` + [`cf/worker-entry.mjs`](../../cf/worker-entry.mjs) `CRON_ROUTES` |

Picked 09:15 UTC to sit slightly off the 09:00 saved-searches digest so the
two scheduled handlers don't pile up against the same Worker instance.

## Configuration

Secret (set via `wrangler secret put`, not in `wrangler.jsonc`):

| Secret | Required | Purpose |
|---|---|---|
| `CRON_SECRET` | yes | Same value used by every cron route. The route returns 401 without it. |

Vars (in `wrangler.jsonc`):

| Var | Used for |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Worker scheduled handler builds the POST URL from this. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Read by `getSupabase()`; `faculty_distances` has no RLS so the anon client can read AND write. |

No service-role key is needed.

## Expected behavior

| State | Response |
|---|---|
| All `(listing, faculty)` pairs already in `faculty_distances` (steady state) | `{ok: true, computed: 0, missingBefore: 0, listings: M, faculties: F}` — pure no-op, no OSRM call. |
| New listing added since last cron tick | OSRM hit; new pairs UPSERTed; `computed` equals the number of new pairs. |
| OSRM returns `null` for some pairs (no foot route) | Those pairs are skipped and counted in `unroutable`; the cron retries them next tick. |
| Listing has null lat/lng | Skipped silently — we can't route from a null coordinate. Not counted as missing. |

## Manual invocation

For testing without waiting for 09:15 UTC:

```bash
# Production
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://studentx.studentx-gr.workers.dev/api/cron/recompute-distances

# Local dev (CRON_SECRET in .env.local)
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  http://localhost:3000/api/cron/recompute-distances
```

Both return JSON. On a fully-populated DB, expect:

```json
{"ok":true,"computed":0,"missingBefore":0,"listings":50,"faculties":13}
```

You can also trigger the production cron from the Cloudflare dashboard:
Workers → `studentx` → Triggers → "Trigger Cron" on `15 9 * * *`.

## Failure modes (what to look for in `wrangler tail`)

`wrangler tail studentx --format=pretty` while the cron runs. Errors are
prefixed `[recompute-distances]`. The route always returns JSON; the
`reason` field tells you what failed.

| Log / response | Cause | Action |
|---|---|---|
| `[recompute-distances] failed to fetch listings:` then 500 | Supabase read of `listings`/`location` failed (network, RLS regression on `location`, etc.). | Check the Supabase project status and the Worker's `NEXT_PUBLIC_SUPABASE_*` vars. |
| `[recompute-distances] failed to fetch faculties:` | Same as above for the `faculties` table. | Same. |
| `[recompute-distances] failed to fetch existing pairs:` | PostgREST page read of `faculty_distances` failed. | Same. |
| `[recompute-distances] OSRM /table HTTP <code>:` | Public OSRM demo returned non-2xx (rate limit, outage, etc.). | Re-run manually or wait for the next tick — the route is idempotent, so retrying is safe. |
| `[recompute-distances] OSRM /table threw: <name> <message>` | Network error or 15s timeout. | Same. |
| `[recompute-distances] OSRM /table unexpected payload: <code>` | OSRM returned a non-`Ok` code (`NoSegment`, etc.). | Inspect the listings — usually means a coordinate fell off the OSM road graph. Fix the lat/lng or unpublish the listing. |
| `[recompute-distances] coord count <N> exceeds OSRM /table limit 100` and 500 | Listings + faculties together exceed the OSRM /table limit. | Add batching (see "OSRM coord-count limit" below). |
| `[recompute-distances] upsert failed:` | Write to `faculty_distances` rejected (constraint violation, conn drop, etc.). | Inspect the error; the route is idempotent so a retry is safe. |
| 401 `Unauthorized` | Missing or wrong `x-cron-secret`. | Verify `CRON_SECRET` is set in the Worker. |

The route never sends email — failures only surface as 500s and Worker
logs. The synthetic-en-listing cron is the user-visible alerting path;
this one is structural.

## OSRM coord-count limit (~100)

OSRM's `/table` endpoint accepts a single coordinate list and the public
demo enforces a soft limit around 100 points. We pass
`listings.length + faculties.length` coordinates per call.

Current scale: ~50 listings × 13 faculties = **63 coordinates per call**,
comfortably under 100. The route refuses to call OSRM if the total
exceeds 100 — it returns 500 with `reason: "coord count <N> > 100;
batching needed"`.

Trigger to add batching: count of listings approaches ~85, or count of
faculties approaches ~50. The shape of batching:

- Chunk listings into groups of `≤100 - faculties.length` and make N
  parallel `/table` calls, each with the full faculty list as
  destinations.
- Merge results into the same UPSERT array.

Batching is intentionally NOT implemented today — premature complexity.

## Manual fallback

The original Python script still works and is the right tool for ad-hoc
regeneration (e.g. after editing the pace constants):

```bash
python3 scripts/compute_distances.py --only-missing
```

Set `SUPABASE_URL` and `SUPABASE_KEY` (service-role) before running. The
script makes one OSRM call per pair and rate-limits at 1.1 req/s, so a
full re-seed of N pairs takes ~N seconds — far slower than the cron's
single `/table` call but useful when you want to regenerate specific
pairs the cron has decided are already filled.

## Related

- [`src/app/api/cron/recompute-distances/route.js`](../../src/app/api/cron/recompute-distances/route.js) — route handler.
- [`cf/worker-entry.mjs`](../../cf/worker-entry.mjs) — cron-expression-to-route mapping.
- [`wrangler.jsonc`](../../wrangler.jsonc) — `triggers.crons` array.
- [`scripts/compute_distances.py`](../../scripts/compute_distances.py) — manual fallback (and the canonical pace-model reference).
- [`supabase/migrations/001_create_schema.sql`](../../supabase/migrations/001_create_schema.sql) — `faculty_distances` PK + FKs.
