# Runbook: syncing Cloudflare cron schedules

The deploy pipeline (`opennextjs-cloudflare deploy`, and the dashboard
Workers Build on push-to-main) pushes the script bundle but **never
touches the Worker's live cron schedules**. Any edit to
`wrangler.jsonc` → `triggers.crons` must be synced to Cloudflare by hand,
or the change silently doesn't take effect (see PR #150, where the
student-message-digest trigger was dropped for 3 days).

## Current schedule (W9 master tick)

There is **exactly one** Cloudflare cron trigger. Job cadences live in
`src/app/api/cron/tick/route.js` (`CRON_JOBS`), not as separate triggers.

| Cron expression | Route | Purpose |
|---|---|---|
| `*/5 * * * *` | `/api/cron/tick` | Master tick — runs due registry jobs |

## Sync

Either:

```bash
wrangler deploy   # full deploy via wrangler syncs triggers
```

or PUT the schedules array directly (must match `wrangler.jsonc`):

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/<acct>/workers/scripts/studentx/schedules" \
  --data '[{"cron":"*/5 * * * *"}]'
```

(Keep the payload identical to `wrangler.jsonc` → `triggers.crons`.)

**After deploying the W9 master-tick code**, a human must run that PUT
(or `wrangler deploy`) so the live Worker drops the old four triggers
and keeps only `*/5 * * * *`. Until then, orphaned expressions hit
`[cron] unknown cron expression` in `wrangler tail` and the new
registry never runs on the intended cadence alone.

## Verify drift

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<acct>/workers/scripts/studentx/schedules" \
  | jq -r '.result.schedules[].cron' | sort
```

Compare against the `triggers.crons` array in `wrangler.jsonc`. They must
match exactly — after W9 that means a single line: `*/5 * * * *`.

## Gotchas

- **Free-plan cap: 5 triggers per Worker.** The 6th is rejected at
  registration with API error 10072 — *silently* from the deploy
  pipeline's point of view. W9 consolidates to one master tick so new
  marketplace timers do not consume slots; still prefer Workers Paid
  ($5/mo) for headroom if you ever need multiple CF-level schedules.
- Every schedule entry must have a matching key in
  `cf/worker-entry.mjs` → `CRON_ROUTES`, or the `scheduled` handler
  drops the event.
- Per-job routes (`/api/cron/recompute-distances`, message digests,
  `synthetic-en-listing`) remain callable with `CRON_SECRET` for manual
  curls; they are not registered as CF cron triggers.
