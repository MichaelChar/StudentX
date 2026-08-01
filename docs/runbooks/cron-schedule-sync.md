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

## ⚠️ Order of operations — do not skip

**Sync the schedule only AFTER the new code is deployed and live.** The
schedule and the code must move in that order, never the reverse.

Syncing first sets the live triggers to whatever `wrangler.jsonc` says
while production is still running the *old* `CRON_ROUTES`. Any expression
the old code doesn't recognise is dropped, and the jobs behind it stop
firing — silently. That is the PR #150 failure mode, reintroduced from
the other direction.

Concretely for the W9 rollout: PUTting `*/5 * * * *` before the tick
deploys would have killed `recompute-distances` (`15 9`), the student
digest (`2-58/5`) and the synthetic canary (`*/15`) with no error
anywhere. (Deploying first is safe in this case, because `*/5` was
already among the old four triggers, so the tick starts firing
immediately and every job keeps running.)

## Sync

**Preferred — no API token needed.** Uses your existing wrangler auth and
applies only the triggers, without redeploying the script:

```bash
npx wrangler triggers deploy
```

**Fallback — the API directly.** Needs `CLOUDFLARE_API_TOKEN` (note the
name: wrangler and the CF docs both use `CLOUDFLARE_API_TOKEN`) and your
account id. A token with **Workers Scripts: Edit** is sufficient — no
zone or user permissions are required, even with the two `custom_domain`
routes, since Workers Custom Domains are account-scoped:

```bash
ACCT=$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
curl -sS -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/scripts/studentx/schedules" \
  --data '[{"cron":"*/5 * * * *"}]'
```

(Keep the payload identical to `wrangler.jsonc` → `triggers.crons`.)

## Verify drift

```bash
ACCT=$(npx wrangler whoami 2>/dev/null | grep -oE '[0-9a-f]{32}' | head -1)
curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/workers/scripts/studentx/schedules" \
  | jq -r '.result.schedules[]?.cron' | sort
```

Compare against the `triggers.crons` array in `wrangler.jsonc`. They must
match exactly — after W9 that means a single line: `*/5 * * * *`.

If jq prints `Cannot iterate over null`, the API returned an error rather
than a schedule list — almost always an unset/expired `CLOUDFLARE_API_TOKEN`
or an empty `$ACCT`. Drop the `| jq …` and read the raw JSON.

**Then confirm it is actually running.** Drift-free config is not proof of
execution:

```bash
npx wrangler tail --name studentx --format pretty
```

Within 5 minutes you should see one `[cron/tick]` line per due job, each
with `outcome=ok`.

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
