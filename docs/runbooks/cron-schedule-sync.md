# Runbook: syncing Cloudflare cron schedules

The deploy pipeline (`opennextjs-cloudflare deploy`, and the dashboard
Workers Build on push-to-main) pushes the script bundle but **never
touches the Worker's live cron schedules**. Any edit to
`wrangler.jsonc` → `triggers.crons` must be synced to Cloudflare by hand,
or the change silently doesn't take effect (see PR #150, where the
student-message-digest trigger was dropped for 3 days).

## Sync

Either:

```bash
wrangler deploy   # full deploy via wrangler syncs triggers
```

or PUT the schedules array directly:

```bash
curl -sS -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/<acct>/workers/scripts/studentx/schedules" \
  --data '[{"cron":"15 9 * * *"},{"cron":"*/5 * * * *"},{"cron":"2-58/5 * * * *"},{"cron":"*/15 * * * *"}]'
```

(Keep the payload identical to `wrangler.jsonc` → `triggers.crons`.)

## Verify drift

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/<acct>/workers/scripts/studentx/schedules" \
  | jq -r '.result.schedules[].cron' | sort
```

Compare against the `triggers.crons` array in `wrangler.jsonc`. They must
match exactly.

## Gotchas

- **Free-plan cap: 5 triggers per Worker.** The 6th is rejected at
  registration with API error 10072 — *silently* from the deploy
  pipeline's point of view. If you need more cadences, consolidate two
  into one trigger with day-of-week branching inside the route
  (`getUTCDay()`), or upgrade to Workers Paid.
- Every schedule entry must have a matching key in
  `cf/worker-entry.mjs` → `CRON_ROUTES`, or the `scheduled` handler
  drops the event.
