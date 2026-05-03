# Runbook — Synthetic check: `/en/listing/<id>` serves English

**Issue:** [#49](https://github.com/MichaelChar/StudentX/issues/49) · **Guards against:** [#48](https://github.com/MichaelChar/StudentX/pull/48)

## What this guards against

PR #48 fixed a class of bug where `getTranslations('ns')` (the bare form) silently fell back to `defaultLocale: 'el'` under OpenNext on Cloudflare Workers, causing Greek copy to render on `/en/listing/<id>` for English users. The fix was to pass an explicit `locale` to every `getTranslations` call in server components.

The bug can recur whenever a new locale-aware server component is added or a sub-tree is extracted without the explicit `locale` prop. Manual QA won't catch silent regressions weeks later. This synthetic check runs every 15 minutes and emails on regression.

## How it works

| Piece | Location |
|---|---|
| Cron trigger (`*/15 * * * *`) | [`wrangler.jsonc`](../../wrangler.jsonc) `triggers.crons` |
| Cron dispatch (cron expr → route) | [`cf/worker-entry.mjs`](../../cf/worker-entry.mjs) `CRON_ROUTES` |
| Check logic + alerting | [`src/app/api/cron/synthetic-en-listing/route.js`](../../src/app/api/cron/synthetic-en-listing/route.js) |

Every 15 min, the Worker's `scheduled` handler POSTs to `/api/cron/synthetic-en-listing` with the `x-cron-secret` header. The route fetches `${NEXT_PUBLIC_APP_URL}/en/listing/${SYNTHETIC_LISTING_ID}` and asserts:

**Required (must be present in body):**
- `<html lang="en"`
- `Sign in to view this listing` — from `student.gate.title` in [`src/messages/en.json`](../../src/messages/en.json)

**Forbidden (must NOT be present in body):**
- `lang="el"`
- `Συνδέσου` — from `student.gate.title` in [`src/messages/el.json`](../../src/messages/el.json)

Any failed assertion (or non-200, or fetch timeout) attempts to send an email via Resend to `SYNTHETIC_ALERT_EMAIL`.

> **Status as of merge:** the email alert path is configured in code but **logs-only in production** because Resend isn't set up yet (`studentx.uk` isn't a registered domain — see [the domain context note](#domain-context) below). Failures surface in `wrangler tail` logs only. To enable email alerts later: register the domain, verify it in Resend, set `RESEND_API_KEY` as a Worker secret. The route's email send is wrapped in try/catch so a missing `RESEND_API_KEY` doesn't break the check itself.

## Configuration

Vars in [`wrangler.jsonc`](../../wrangler.jsonc):

| Var | Default | Purpose |
|---|---|---|
| `SYNTHETIC_LISTING_ID` | `0100006` | Listing ID to probe. Must be permanently published. |
| `SYNTHETIC_ALERT_EMAIL` | `michaeltubehd007@gmail.com` | Where alerts go. |

Secrets (set via `wrangler secret put`, not in `wrangler.jsonc`):

- `CRON_SECRET` — required, same value used by all cron routes.
- `RESEND_API_KEY` — required for the alert path. Without it the route logs but cannot email.

## When the alert fires

Subject: `[StudentX synthetic] /en/listing/<id> failed: <reason>`

Body includes status code, which assertion failed, and the first 500 chars of the returned HTML. Possible reasons:

- `non-200 status: <code>` — the page errored or redirected. Check the Worker logs.
- `missing required EN marker: <marker>` — the page returned 200 but the English copy disappeared. Either the gate copy was edited (update marker below) or the i18n regression class is back.
- `forbidden EL marker present: <marker>` — Greek leaked onto the EN page. **This is the regression we're guarding against** — investigate `getTranslations` calls in any recently-changed server component.
- `fetch threw: ...` — the Worker couldn't reach the public hostname. Could be a Worker outage or DNS issue.

## Maintenance

**Marker strings change with copy edits.** If you edit `student.gate.title` in either locale's messages file, update the constants at the top of [`src/app/api/cron/synthetic-en-listing/route.js`](../../src/app/api/cron/synthetic-en-listing/route.js):

- `EN_MARKERS_REQUIRED` — must be a unique string from the EN gate copy
- `EL_MARKERS_FORBIDDEN` — must be a unique string from the EL gate copy that has no English equivalent

**Stable listing ID.** `0100006` is the default. If it ever gets unpublished or removed, swap `SYNTHETIC_LISTING_ID` in `wrangler.jsonc` to another permanently-published listing ID.

**Silence temporarily.** Comment out `"*/15 * * * *"` in `wrangler.jsonc` and the matching entry in `cf/worker-entry.mjs` `CRON_ROUTES`, then `npm run cf:build && wrangler deploy`. Re-enable when ready.

## Manual trigger

Local dev server:
```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  http://localhost:3000/api/cron/synthetic-en-listing
# Expect: {"ok":true,"status":200}
```

Production (manual run, doesn't wait for the next 15-min tick):
- Cloudflare dashboard → Workers → `studentx` → Triggers → "Trigger Cron" on `*/15 * * * *`, OR
- `curl -X POST -H "x-cron-secret: <secret>" https://studentx.studentx-gr.workers.dev/api/cron/synthetic-en-listing`

## Domain context

The codebase fallback addresses (`alerts@studentx.uk`) and the `NEXT_PUBLIC_SITE_URL` default (`https://studentx.uk`) reference a domain that is not yet registered. The live deploy runs on `studentx.studentx-gr.workers.dev` (a `*.workers.dev` subdomain) until DNS is sorted. This is why the email alert path is currently logs-only:

1. Resend rejects sends from unverified domains.
2. `studentx.uk` can't be verified because it doesn't exist.
3. Until the domain is registered + verified, all email-sending paths in the codebase (this synthetic, saved-searches digest, landlord message digest, inquiry email) silently fail at the Resend send step.

To enable email here:

1. Register `studentx.uk` (or pick a different domain and update `NEXT_PUBLIC_SITE_URL` + the from-addresses in code).
2. Add the domain to Cloudflare (or whatever DNS host you'll use).
3. In Resend, add a sending subdomain (e.g. `updates.studentx.uk`) and follow the DNS verification flow.
4. `npx wrangler secret put RESEND_API_KEY --name studentx`
5. Update `RESEND_FROM_EMAIL` in `wrangler.jsonc` (or each route's hardcoded from-address) to match the verified subdomain.

## Known limitations

- **Same-network probe.** The cron runs inside the same Cloudflare Worker that serves the page. Doesn't simulate a US user's edge cache. Acceptable because the listing page currently sets `Cache-Control: private, no-cache, no-store, must-revalidate` — there is no edge cache to test from a different POP.
- **No alert dedupe.** A sustained outage would email every 15 min once email is wired up. If this becomes annoying, add a `synthetic_alert_state(check_name, last_alert_at)` Supabase row and gate the email on `now() - last_alert_at > 1 hour`.
- **Logs-only until email is configured.** See [Domain context](#domain-context) above.
