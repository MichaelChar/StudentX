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

**Vary header (anon fetch — `en-listing-vary-cookie`):**
- The anon response **must** include `Vary: Cookie`.

  This is the assertion that makes the two Cache-Control checks mean anything. Those prove the *origin* stamps the right header for each caller; neither can prove the **CDN keeps the two apart**, and that is the half that leaks. Without `Vary: Cookie`, Cloudflare may serve the anon-cached body to a request carrying an `sb-access-token` — the origin is never consulted, so `en-listing-authed-cache` keeps passing while a signed-in user is handed a cached anon body (and an authed body could be stored under a key an anon visitor later matches).

  Matched with a word-boundary regex, not a substring test: `Vary: Set-Cookie` contains "cookie" but varies on a *response* header name and does nothing to separate anon from authed requests. A naive `includes('cookie')` would report a split that does not exist.

**Cache headers (authed fetch — `en-listing-authed-cache`):**
- A second fetch goes out with `Cookie: sb-access-token=synthetic-canary-stub`. The middleware checks cookie *presence* only (not validity), so any non-empty value trips the authed branch. The response **must NOT** include `public, s-maxage=`. If it does, the gated body is CDN-cacheable across users — the original session-leak shape that issue #67 was filed for.
- The same response must **also** still carry `Vary: Cookie`. Both conditions report under this one check name rather than two, so a single middleware regression raises one alert instead of double-flagging.

**Edge cache, anon (`cf-cache-status-hit`):**
- Warms the edge, then asserts a repeat anonymous fetch reports `cf-cache-status: HIT`. Uses GLOBAL fetch (the public URL through Cloudflare) rather than the service binding, which bypasses the CDN entirely and could never report HIT. This is the check that catches the #130 failure class — a Cache Rule that matches the wrong path caches nothing while every origin-header check stays green.
- **Skips when there is no `cf-cache-status` header at all**, which is indistinguishable from "not behind a CDN". That is deliberate (it keeps local/dev runs quiet) but it does mean this check was *silently inconclusive* for the whole period the #130 rule was mismatched. A long run of `skipped` on this check is itself the signal.

**Edge cache, authed (`cf-cache-authed-not-hit`):**
- Warms the edge **anonymously**, then fetches the same URL WITH `Cookie: sb-access-token=synthetic-canary-stub` and asserts the response is **not** `cf-cache-status: HIT`.
- This is the other half of the pair, and the only check that can observe a real session leak. `en-listing-authed-cache` and `en-listing-vary-cookie` prove the *origin* behaves; neither can see the CDN. If the Cache Rule is widened, reordered, or loses its `not http.cookie contains "sb-access-token"` clause, Cloudflare starts answering authed requests from the anon entry — the origin is never consulted, so every origin-side check stays green while a signed-in student receives the anonymous, contact-info-gated body.
- A HIT here is the failure. Skips on the same inconclusive conditions as its sibling.

**University-distance coverage (`university-distance-coverage`):**
- Asserts that a pin in central Thessaloniki still produces a measured distance for **every** university in `DEFAULT_CITY` (`thessaloniki`).
- The expected set is read from the `universities` table, filtered by `city_slug` **in Postgres** (not in JS, so the set measured is always the set expected — a second city's universities are never measured from the Thessaloniki pin and discarded), and never hardcoded. A newly added university that nobody gave coordinates to fails this check rather than being silently ignored.
- Calls `computeUniversityDistances()` directly with the same two data sources `/api/landlord/compute-university-distances` uses (`faculties` + `universities.lat/lng`). It does **not** HTTP-call that route — the landlord endpoint requires a bearer token the cron does not have.
- Fails when the measured set is missing any expected university, or when a distance is `<= 0` or above `MAX_DISTANCE_METERS` (50 km, the existing typo-guard ceiling in `src/lib/universityDistances.js`).
- This is the check that would have caught the AUTH-only faculties hole: prod holds 13 faculty rows, all AUTH, so before migration 119 the wizard could only measure one university. After PR #542 made the universities step read-only, the "at least 2 distances" gate blocked every new listing at step 4. CI never saw it because `e2e/specs/06-landlord-wizard.spec.js` stubs that endpoint with all three. Fixed in PR #545; this canary is the production net.
- Does not depend on a live listing. Skips only on the same inconclusive timeout/abort class as the other checks; a missing coordinate is a real failure.
- Uses haversine (`useOsrm: false`) so a 15s public-OSRM round-trip cannot contend with the master tick's ~25s budget. The bug class is missing coordinates, not routing.

**Basemap tile reachability (`carto-tile-reachable`):**
- Fetches ONE real tile (Thessaloniki centre, z12) from the same `CARTO_TILE_URL` the maps render with, and asserts `200` + an `image/*` content-type.
- **This is a different failure from `carto-tile-key`.** That check proves the API key reached the client bundle; it matches on host + `?key=`, and so does `scripts/check-build-output.mjs`. A URL that is keyed, well-formed and points at a style CARTO does not serve passes both — and blanks all four Leaflet surfaces with no console error, no failing test and nothing in the page HTML to notice.
- Not hypothetical: CARTO serves Positron at both `/light_all/...` and `/rastertiles/light_all/...`, so the short form looks like the general shape of a tile URL. Voyager exists **only** under `rastertiles/`; the short `/voyager/` form 404s. A swap written that way sat in the working tree and would have shipped blank maps (caught in #554 before it did).
- **404/410 is a hard failure** — that is our bug, a style slug that does not exist. **401/403 skips**: the key is domain-restricted and a server-side fetch carries no `Referer`; that has never been rejected (verified 2026-09-12), but if CARTO tightens the policy it is not this check's failure class and should not page anyone about a working map. Other non-200s and timeouts skip like everywhere else.

Any failed assertion (or non-200, or fetch timeout) attempts to send an email via Resend to `SYNTHETIC_ALERT_EMAIL`.

> **Status (2026-05-03):** Resend is verified for `studentx.uk` and `RESEND_API_KEY` is set as a Worker secret — the alert path is live. On failure the route emails `SYNTHETIC_ALERT_EMAIL` from `michael@studentx.uk` (the sender moved off `alerts@` on 2026-09-11 — it was never registered to send in Resend). Failures still surface in `wrangler tail` regardless. The route's email send is wrapped in try/catch, so a Resend hiccup doesn't break the check itself.

### Fetch strategy: service binding, sequential heavy renders

Every check fetches via the **service binding (`env.WORKER_SELF_REFERENCE`)** — `fetchUrl` in `route.js` falls back to global `fetch()` only outside the Cloudflare runtime (local dev, unit tests). Service-binding sub-fetches bypass DNS/CDN/asset-binding interception, giving a deterministic origin response — required for the cache-header assertions and to avoid the workers.dev asset-binding 404 on `/api/*`.

To stay inside Worker resource limits, the route splits the checks into two waves:

- **Lightweight checks** (API routes, static assets, redirects, and the university-distance coverage query: `/api/listings/<id>`, `/api/landlord/listings`, `/og-default.png`, `/en` missing-message, `soft-404`, `university-distance-coverage`) run **concurrently** via `Promise.all`. These don't render heavy SSR, so concurrent execution is fine.
- **Heavy property-page locale checks** (`en-cityhub-locale`, `en-homepage-locale`, `en-quiz-locale`) and the listing-detail render run **sequentially** via the same service binding. These pages SSR WebGL components (HubBackground 240k particles, HubDiagram, StripeGradientMesh) and would exhaust the Worker CPU budget if rendered in parallel.

> **Historical note (PR #133):** the three heavy property-page checks originally used global `fetch()` via the CDN to dodge SSR entirely, but that caused Worker self-fetch 522s whenever the CDN cache was cold (post-deploy, different edge PoP). Running them sequentially via the service binding sidesteps both the SSR resource pressure and the cold-cache 522. The trade-off is that genuine i18n regressions surface immediately (no CDN-TTL lag).

## Configuration

Vars in [`wrangler.jsonc`](../../wrangler.jsonc):

| Var | Default | Purpose |
|---|---|---|
| `SYNTHETIC_LISTING_ID` | `0106002` | Preferred listing to probe. A *preference*, not a guarantee — see below. |
| `SYNTHETIC_ALERT_EMAIL` | `michaeltubehd007@gmail.com` | Where alerts go. |

### Which listing gets probed

`resolveSyntheticListingId()` runs before the checks and picks the target:

1. `SYNTHETIC_LISTING_ID` — used if `/api/listings/<id>` returns 200 (or an
   inconclusive Cloudflare 5xx / timeout, which is not evidence it's gone).
2. Otherwise the first listing from `/api/listings?limit=1`.
3. Otherwise **null** — the four listing-scoped checks (`en-listing-locale`,
   `en-listing-anon-cache`, `en-listing-authed-cache`, `listing-api-distances`,
   `cf-cache-status-hit`) record `{ ok: true, skipped: true }` and the run
   passes on the remaining checks.

The pin used to be taken on faith, on the assumption its target was
"permanently published". The go-live gates (PR #382) ended that: a listing is
public only while its landlord ID check **and** video-call verification hold,
and an admin can take any listing offline from `/admin/listing-go-live`. An
offline pin turned every tick into four failures plus an alert email — and
with no dedupe (see [Known limitations](#known-limitations)) that's ~96
emails/day describing a deliberate ops action rather than an outage.

**An empty public directory is a valid state, not an outage.** If every
listing is awaiting video verification, the canary goes quiet on the
listing-scoped checks and keeps guarding the rest (soft-404, og image,
landlord-API auth, missing-message, university-distance coverage, the
three property-page renders, cron drift). Step 2 also means a stale pin
self-heals instead of silently degrading — the `0100006` failure mode
described under Maintenance.

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
- `measured set missing <ids>` — pin-to-university measurement did not cover every university in `DEFAULT_CITY`. Either a university has no `faculties` rows **and** no `universities.lat/lng` (the AUTH-only hole #545 fixed), or a newly added university was inserted without coordinates. Check `universities` for the missing ids and the `faculties.university` codes that should map onto them. The alert body carries the metres it *did* measure and names both position sources, so the common cases are diagnosable without opening this file.
- `implausible distance (must be 1..50000 m)` — a measured distance was `<= 0` or above the typo-guard ceiling. Usually a Null-Island coordinate (`lat`/`lng` stored as 0) or a swapped lat/lng. `MAX_DISTANCE_METERS` in `src/lib/universityDistances.js` is the same ceiling the landlord write path uses.
- `expected at least 1 university in thessaloniki, got 0` — the `universities` table returned no rows for `DEFAULT_CITY`. Seed/data regression, not a measurement bug.
- `universities lookup failed` / `faculties lookup failed` — the public SELECT against those tables failed. Check RLS and the Worker's `NEXT_PUBLIC_SUPABASE_*` vars.
- `tile 404 at <url> — the style slug does not exist` — **every map on the site is blank right now.** The basemap URL in `src/lib/mapTiles.js` names a CARTO style that isn't served. Almost always the `rastertiles/` prefix: Voyager exists only at `rastertiles/voyager`, while Positron answers at both `/light_all/` and `/rastertiles/light_all/`, which is what makes the short form look correct. Fix the constant; `carto-tile-key` and the build guard will NOT catch this class.
- `tile returned 200 but content-type ...` — CARTO answered with something that isn't an image, usually an HTML error or consent page. Check the key and the account's status.
- `fetch threw: ...` — the Worker couldn't reach the public hostname. Could be a Worker outage or DNS issue.

## Maintenance

**Marker strings change with copy edits.** If you edit `student.gate.title` in either locale's messages file, update the constants at the top of [`src/app/api/cron/synthetic-en-listing/route.js`](../../src/app/api/cron/synthetic-en-listing/route.js):

- `EN_MARKERS_REQUIRED` — must be a unique string from the EN gate copy
- `EL_MARKERS_FORBIDDEN` — must be a unique string from the EL gate copy that has no English equivalent

**Stable listing ID.** `0106002` is the default. It no longer *has* to stay published — the resolver falls back to any live listing and then to skipping (see [Which listing gets probed](#which-listing-gets-probed)) — but keeping it pointed at a stable, published listing gives the most consistent signal. The old `0100006` seed ID was retired when prod was reseeded to the `01060xx` scheme, which silently 404'd the API probe (and skipped the four listing-page checks as inconclusive 522s); that class of silent degradation is what step 2 of the resolver now heals. When repinning, confirm the new ID returns 200 from `/api/listings/<id>` with ≥2 distinct `walk_minutes` first.

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
- `curl -X POST -H "x-cron-secret: <secret>" https://studentx.uk/api/cron/synthetic-en-listing`

## Domain context

`studentx.uk` is the live custom domain (since 2026-05-03). DKIM/SPF/DMARC records are on the CF zone, the apex is verified in Resend, and `RESEND_API_KEY` is a Worker secret. Email alerts from this synthetic check send from `michael@studentx.uk`. The original setup history lives in [`docs/runbooks/domain-setup.md`](./domain-setup.md).

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

- **`cf-cache-status-hit` and `cf-cache-authed-not-hit` skip permanently, and that is correct.** Both treat an absent `cf-cache-status` header as inconclusive. As of 2026-09-12 that is the permanent state for HTML on this zone: the Worker is attached as a custom domain (`wrangler.jsonc`), so Cloudflare Cache Rules do not cache its responses and no HTML carries the header. A Cache Rule was applied to prod to confirm this — see `docs/edge-caching-assessment.md`. **Do not "fix" these into failing.** A skip is the honest report for a check whose precondition cannot be met, and both become meaningful again the moment the attachment model changes. The caching that IS happening shows up as `x-opennext-cache: HIT` on prerenderable pages, which these checks deliberately do not assert — that is OpenNext's layer, not the CDN's.

- **Same-network probe.** The cron runs inside the same Cloudflare Worker that serves the page, so it sees the origin response, not what a different PoP returns from cache. The header check is still meaningful (it confirms the Worker is sending the right `cache-control` for both branches), but a real session-leak across PoPs would only surface via the manual two-tab browser test in `docs/runbooks/`. Worth running that test by hand once a week post-PR-#105 deploy until the design is settled.
- **`Vary: Cookie` may not split CDN keys on Cloudflare free tier.** The Cache Rule therefore does not rely on it alone — its expression carries `not http.cookie contains "sb-access-token"`, so an authed request never matches the rule in the first place. `Vary: Cookie` stays as the second layer. `cf-cache-authed-not-hit` is what proves the pair actually works at the CDN; see [cloudflare-cache-rule.md](cloudflare-cache-rule.md).
- **Path-prefix gotcha — the rule must match the canonical city-prefixed URL.** Cloudflare evaluates a rule expression on the *request* URL **before** the middleware-driven 301 fires, so a rule matching the legacy `/property/listing/...` caches the 301 itself and never the page. The rule must reference the canonical `/property/<city>/listing/...`. If the origin-header checks pass but `cf-cache-status` is absent on the canonical URL, this is the most likely cause — it is exactly what #130 was filed for. (The `/en/...` mirrors this entry used to mention are gone: #158 made every `/en/*` path 301 to its unprefixed equivalent.)
- **The city segment is not `thessaloniki`-only.** `SUPPORTED_CITIES` in `src/lib/cityRoutes.js` currently holds seven slugs. Any Cache Rule clause that hardcodes `thessaloniki` silently stops protecting the others the day a second city goes live — which is why the landlord exclusion is written as a city-agnostic `contains "/landlord"`.
- **No alert dedupe.** A sustained outage emails every 15 min. If this becomes annoying, add a `synthetic_alert_state(check_name, last_alert_at)` Supabase row and gate the email on `now() - last_alert_at > 1 hour`.
