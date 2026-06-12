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

Every 15 min, the Worker's `scheduled` handler POSTs to `/api/cron/synthetic-en-listing` with the `x-cron-secret` header. The route fetches `${NEXT_PUBLIC_APP_URL}/en/property/thessaloniki/listing/${SYNTHETIC_LISTING_ID}` (the city-prefixed canonical path; `/en/property/listing/<id>` 301s to it via `src/middleware.js`) and asserts:

**Body (anon fetch — `en-listing-locale`):**

Required (must be present):
- `<html lang="en"`
- `Sign in to view this listing` — from `student.gate.title` in [`src/messages/en.json`](../../src/messages/en.json)

Forbidden (must NOT be present):
- `lang="el"`
- `Συνδέσου` — from `student.gate.title` in [`src/messages/el.json`](../../src/messages/el.json)

**Cache headers (anon fetch — `en-listing-anon-cache`):**
- Response **must** include `public, s-maxage=` — middleware (PR #105 / issue #67) sets this for visitors without an `sb-access-token` cookie so Cloudflare's edge can cache the AuthGate body across anon viewers. If the header drops back to `private` we silently lose the perf win.

**Cache headers (authed fetch — `en-listing-authed-cache`):**
- A second fetch goes out with `Cookie: sb-access-token=synthetic-canary-stub`. The middleware checks cookie *presence* only (not validity), so any non-empty value trips the authed branch. The response **must NOT** include `public, s-maxage=`. If it does, the gated body is CDN-cacheable across users — the original session-leak shape that issue #67 was filed for.

Any failed assertion (or non-200, or fetch timeout) attempts to send an email via Resend to `SYNTHETIC_ALERT_EMAIL`.

> **Status (2026-05-03):** Resend is verified for `studentx.uk` and `RESEND_API_KEY` is set as a Worker secret — the alert path is live. On failure the route emails `SYNTHETIC_ALERT_EMAIL` from `alerts@studentx.uk`. Failures still surface in `wrangler tail` regardless. The route's email send is wrapped in try/catch, so a Resend hiccup doesn't break the check itself.

### Fetch strategy: service binding, sequential heavy renders

Every check fetches via the **service binding (`env.WORKER_SELF_REFERENCE`)** — `fetchUrl` in `route.js` falls back to global `fetch()` only outside the Cloudflare runtime (local dev, unit tests). Service-binding sub-fetches bypass DNS/CDN/asset-binding interception, giving a deterministic origin response — required for the cache-header assertions and to avoid the workers.dev asset-binding 404 on `/api/*`.

To stay inside Worker resource limits, the route splits the checks into two waves:

- **Lightweight checks** (API routes, static assets, redirects: `/api/listings/<id>`, `/api/landlord/listings`, `/og-default.png`, `/en` missing-message, `soft-404`) run **concurrently** via `Promise.all`. These don't render heavy SSR, so concurrent execution is fine.
- **Heavy property-page locale checks** (`en-cityhub-locale`, `en-homepage-locale`, `en-quiz-locale`) and the listing-detail render run **sequentially** via the same service binding. These pages SSR WebGL components (HubBackground 240k particles, HubDiagram, StripeGradientMesh) and would exhaust the Worker CPU budget if rendered in parallel.

> **Historical note (PR #133):** the three heavy property-page checks originally used global `fetch()` via the CDN to dodge SSR entirely, but that caused Worker self-fetch 522s whenever the CDN cache was cold (post-deploy, different edge PoP). Running them sequentially via the service binding sidesteps both the SSR resource pressure and the cold-cache 522. The trade-off is that genuine i18n regressions surface immediately (no CDN-TTL lag).

## Configuration

Vars in [`wrangler.jsonc`](../../wrangler.jsonc):

| Var | Default | Purpose |
|---|---|---|
| `SYNTHETIC_LISTING_ID` | `0106002` | Listing ID to probe. Must be permanently published. |
| `SYNTHETIC_ALERT_EMAIL` | `michaeltubehd007@gmail.com` | Where alerts go. |

Secrets (set via `wrangler secret put`, not in `wrangler.jsonc`):

- `CRON_SECRET` — required, same value used by all cron routes.
- `RESEND_API_KEY` — required for the alert path. Without it the route logs but cannot email.

## When the alert fires

Subject: `[StudentX synthetic] N check(s) failed`

Body includes the failing check name, reason, and the first 500 chars of the anon HTML response. Possible reasons:

- `non-200 status: <code>` — the page errored or redirected. Check the Worker logs. Every probe goes via the service binding (see [Fetch strategy](#fetch-strategy-service-binding-sequential-heavy-renders)), so a non-200 is the origin's own response — not a CDN miss. Try the user-facing curl to confirm whether external visitors see the same. **Cloudflare-class 5xx (520, 522, 523, 524) is no longer reported as a failure** — service-binding sub-fetches can hit these transiently when CF's runtime hiccups, and the page is almost always healthy seconds before and after (e.g. the 2026-05-17 16:00 `523` alert that prompted this carve-out). The skip surfaces in the run record as `{ ok: true, skipped: true, reason: "skipped: Cloudflare 523" }`. A genuine Worker outage still surfaces — either as `fetch threw: ...` errors or as simultaneous failures across multiple canaries (the suppressed codes are checked per-fetch, not globally).
- `missing required EN marker: <marker>` — page returned 200 but the English copy disappeared. Either the gate copy was edited (update marker constants in `route.js`) or the i18n regression class from PR #48 is back.
- `forbidden EL marker present: <marker>` — Greek leaked onto the EN page. **i18n regression** — investigate `getTranslations` calls in any recently-changed server component.
- `anon listing detail must serve public, s-maxage=...` — the middleware-set per-request cache header (PR #105) regressed for anon visitors. Either middleware.js stopped matching the path, or `next.config.mjs` re-introduced a static `private` rule that's overriding it. Run the curl commands in the [Manual cache-header probe](#manual-cache-header-probe) section to localise.
- `authed listing detail returned public, s-maxage=... — session-leak risk` — **stop and investigate immediately**. The cookied request branch is now serving cacheable headers; if Cloudflare honours them, gated bodies will leak across users. Most likely cause: `next.config.mjs` got a static `public` rule for `/property/listing/*` (the same regression class the pre-PR-105 attempt was reverted for). Roll back the offending change or pin both static + middleware to private until investigated.
- `fetch threw: ...` — the Worker couldn't reach the public hostname. Could be a Worker outage or DNS issue.

## Maintenance

**Marker strings change with copy edits.** If you edit `student.gate.title` in either locale's messages file, update the constants at the top of [`src/app/api/cron/synthetic-en-listing/route.js`](../../src/app/api/cron/synthetic-en-listing/route.js):

- `EN_MARKERS_REQUIRED` — must be a unique string from the EN gate copy
- `EL_MARKERS_FORBIDDEN` — must be a unique string from the EL gate copy that has no English equivalent

**Stable listing ID.** `0106002` is the default. It must point at a permanently-published listing; the old `0100006` seed ID was retired when prod was reseeded to the `01060xx` scheme, which silently 404'd the API probe (and skipped the four listing-page checks as inconclusive 522s). If it ever gets unpublished or removed, swap `SYNTHETIC_LISTING_ID` in `wrangler.jsonc` to another permanently-published listing ID — confirm it returns 200 from `/api/listings/<id>` with ≥2 distinct `walk_minutes` first.

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

`studentx.uk` is the live custom domain (since 2026-05-03). DKIM/SPF/DMARC records are on the CF zone, the apex is verified in Resend, and `RESEND_API_KEY` is a Worker secret. Email alerts from this synthetic check send from `alerts@studentx.uk`. The original setup history lives in [`docs/runbooks/domain-setup.md`](./domain-setup.md).

## Manual cache-header probe

When investigating a `*-cache` failure, the same two requests the canary makes can be reproduced with curl from any shell:

```bash
# Anon — must include `cache-control: public, s-maxage=300, ...`
curl -sI https://studentx.uk/en/property/thessaloniki/listing/0100006 | grep -i cache-control

# Authed — must NOT include `public, s-maxage=...` (private/no-store is fine)
curl -sI -H 'Cookie: sb-access-token=any-non-empty-value' \
  https://studentx.uk/en/property/thessaloniki/listing/0100006 | grep -i cache-control

# Bonus — confirm Cloudflare is actually caching the anon variant.
# Run twice; second call should show `cf-cache-status: HIT`.
curl -sI https://studentx.uk/en/property/thessaloniki/listing/0100006 | grep -i cf-cache-status
curl -sI https://studentx.uk/en/property/thessaloniki/listing/0100006 | grep -i cf-cache-status
```

If the anon request returns `private` or the authed request returns `public, s-maxage=`, the middleware split has broken — start with `git log middleware.js next.config.mjs` to find the offending change.

## Known limitations

- **Same-network probe.** The cron runs inside the same Cloudflare Worker that serves the page, so it sees the origin response, not what a different PoP returns from cache. The header check is still meaningful (it confirms the Worker is sending the right `cache-control` for both branches), but a real session-leak across PoPs would only surface via the manual two-tab browser test in `docs/runbooks/`. Worth running that test by hand once a week post-PR-#105 deploy until the design is settled.
- **`Vary: Cookie` may not split CDN keys on Cloudflare free tier.** If a session leak is observed despite the canary passing, add a Cloudflare Cache Rule in the dashboard: "Bypass cache when Cookie contains `sb-access-token`". This sacrifices the perf win for authed users (small fraction of traffic on a directory site) and keeps anon caching intact.
- **Path-prefix gotcha — the rule must match the canonical city-prefixed URL.** The deployed Cloudflare Cache Rule's match expression must reference `/property/thessaloniki/listing/...` (and `/en/...`), not `/property/listing/...`. Cloudflare's rule fires on the *request* URL **before** the middleware-driven 301 redirect happens, so a rule matching the legacy path only caches the 301 itself — not the actual page response. If the canary `*-cache` checks pass but `cf-cache-status` is absent on the canonical URL, this is the most likely cause.
- **No alert dedupe.** A sustained outage emails every 15 min. If this becomes annoying, add a `synthetic_alert_state(check_name, last_alert_at)` Supabase row and gate the email on `now() - last_alert_at > 1 hour`.
