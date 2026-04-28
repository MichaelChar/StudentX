# CLAUDE.md

Single-page orientation for Claude / agent sessions working in this repo.
Keep this file accurate when conventions change.

## Project overview

**StudentX** is a curated student-housing directory for Thessaloniki, Greece.
Bilingual (Greek default, English secondary). Students browse listings filtered
by faculty + commute time; landlords manage listings and reply to inquiries; a
small admin surface verifies landlords. Not an open marketplace — every listing
is curated and verified.

## Tech stack

- **Framework:** Next.js `16.2.1` (App Router, JS — no TypeScript), React `19.2.4`.
- **i18n:** `next-intl@^4.9.0` (`el` + `en`).
- **Backend:** Supabase (`@supabase/supabase-js@^2.101.0`) — Postgres + Auth + Storage + Realtime.
- **Email:** Resend (`resend@^4.0.0`) — currently logs-only in prod, see Email section.
- **Payments:** Stripe (`stripe@^22.0.0`) — landlord plans + verified-tier upgrades.
- **Maps:** Leaflet `1.9.4` + `react-leaflet@^5.0.0`; OSM tiles; topojson + d3-geo for region shapes.
- **CSS:** Tailwind v4 (`tailwindcss@^4` + `@tailwindcss/postcss`).
- **Hosting:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare@^1.18.0`),
  `wrangler@^4.80.0`. Live at `https://studentx.studentx-gr.workers.dev`
  (a `*.workers.dev` subdomain) until `studentx.gr` DNS is wired up.
- **Lint:** `eslint@^9` + `eslint-config-next@16.2.1`. **No test framework yet.**

## Repo layout

```
.
├── CLAUDE.md                    ← this file
├── middleware.js                ← next-intl middleware (REPO ROOT, not src/)
├── next.config.mjs              ← security headers, CSP (enforced), cache policy
├── wrangler.jsonc               ← Worker name, vars, cron triggers
├── cf/
│   └── worker-entry.mjs         ← Worker shim adding `scheduled` handler
├── src/
│   ├── app/
│   │   ├── [locale]/            ← locale-aware route tree (el + en)
│   │   ├── api/                 ← API routes (no locale prefix)
│   │   │   └── cron/            ← scheduled-handler endpoints
│   │   ├── landlord/, listing/, results/  ← non-locale parallel routes
│   │   ├── layout.js, page.js, sitemap.js, robots.js
│   ├── components/              ← React components (server-default, 'use client' only when needed)
│   ├── i18n/{routing.js, request.js, navigation.js}
│   ├── lib/                     ← server helpers (supabase, requireStudent, transformListing, …)
│   └── messages/{el,en}.json    ← next-intl message catalogs
├── supabase/
│   ├── migrations/              ← numbered SQL migrations (37+ files)
│   ├── config.toml, seed.sql
├── docs/
│   ├── runbooks/                ← operational runbooks
│   └── schema.md                ← star-schema reference
├── scripts/                     ← Python ingest pipeline + one-off data scripts
├── templates/                   ← email HTML (inquiry-notification-{el,en}.html)
└── .github/workflows/           ← CI (ci.yml, claude*.yml, migration-check.yml)
```

`.claude/worktrees/` is gitignored (PR #53) — used by parallel sub-agents.

## Locale routing

`src/i18n/routing.js`:

```js
locales: ['el', 'en']
defaultLocale: 'el'
localePrefix: 'as-needed'  // /results (Greek), /en/results (English)
```

The middleware lives at the **repo root** as `middleware.js` (NOT `src/middleware.js`).
It runs `createMiddleware(routing)` with matcher
`'/((?!api|_next|_vercel|.*\\..*).*)'`.

Both `/listing/<id>` and `/en/listing/<id>` resolve to
`src/app/[locale]/listing/[id]/page.js`. The non-locale parallel directories
(`src/app/landlord/`, `src/app/listing/`, `src/app/results/`) exist as the
unprefixed Greek-default entry points the middleware rewrites into the
`[locale]` tree.

## i18n calling convention (READ THIS BEFORE TOUCHING SERVER COMPONENTS)

**Always pass `locale` explicitly to `getTranslations`:**

```js
const t = await getTranslations({ locale, namespace: 'student.gate' });
```

The bare form `getTranslations('namespace')` reads from next-intl's request
scope, which under OpenNext on Workers can fall through to `defaultLocale: 'el'`
when the component renders inside a redirect/guard branch — producing Greek
copy on `/en/` routes. PR #48 fixed every known instance; #52 and #54 cleaned
up two more. Synthetic check (#50) guards against recurrence.

`AuthGate` takes `locale` as an explicit prop. Its JSDoc is the canonical
explanation — copying verbatim from `src/components/AuthGate.js`:

> `locale` must be passed explicitly by the caller. Bare
> `getTranslations('namespace')` reads from next-intl's request scope, which
> under OpenNext on Workers can fall through to `defaultLocale` ('el') for
> components rendered inside a redirect/guard branch — producing Greek copy
> on /en/ routes. The explicit `{ locale, namespace }` form is authoritative.

When a server component receives `params`, also call `setRequestLocale(locale)`
near the top — see `src/app/[locale]/listing/[id]/page.js` for the canonical
pattern.

## OpenNext-on-Workers quirks

1. **next-intl request scope is unreliable inside redirect/guard branches.**
   See above. Always pass `{ locale, namespace }` explicitly.

2. **Auth-touching pages don't get CDN caching, regardless of `next.config.mjs`.**
   `next.config.mjs` declares `public, s-maxage=300, stale-while-revalidate=86400`
   for marketing routes and `private, no-cache, no-store, must-revalidate` for
   `/landlord/*`, `/listing/*`, `/student/*` (and their `/en/` counterparts).
   Verified via `curl` on prod: public pages get the public header correctly;
   auth-touching pages get `private, no-cache` regardless of any `s-maxage`
   config — OpenNext / Workers force-private any response from a route that
   touches request-scoped APIs (cookies, headers).

3. **OpenNext v1.x doesn't ship a `scheduled` handler.** `cf/worker-entry.mjs`
   wraps `.open-next/worker.js` to add one and re-exports the Durable Object
   classes (`DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge`) that
   Cloudflare requires at module top level.

## Cron architecture

Two pieces must stay in sync:

| Piece | File | What it holds |
|---|---|---|
| Cron triggers | `wrangler.jsonc` `triggers.crons` | Cron expressions Cloudflare fires |
| Cron dispatch | `cf/worker-entry.mjs` `CRON_ROUTES` | Cron expression → `{ name, path, query }` |

The `scheduled` handler looks up `event.cron` in `CRON_ROUTES`, then POSTs
to `${NEXT_PUBLIC_APP_URL}${path}?${query}` with the `x-cron-secret` header.
25-second `AbortSignal.timeout` (under CF's ~30 s scheduled-handler limit).
`ctx.waitUntil()` keeps the Worker alive past the synchronous return.

**All cron routes auth via `CRON_SECRET`** — accepted via either the
`x-cron-secret` header OR `?secret=` query param. `CRON_SECRET` is a Worker
secret, set with `wrangler secret put CRON_SECRET --name studentx`.

Current crons (verified against `wrangler.jsonc` and `cf/worker-entry.mjs`):

| Cron expression | Route | Purpose |
|---|---|---|
| `0 9 * * *`     | `/api/cron/saved-searches-digest?frequency=daily`  | Daily saved-search digest |
| `0 9 * * 1`     | `/api/cron/saved-searches-digest?frequency=weekly` | Weekly saved-search digest (Monday) |
| `15 9 * * *`    | `/api/cron/recompute-distances`                    | Heal missing `faculty_distances` rows (PR #60) |
| `*/5 * * * *`   | `/api/cron/landlord-message-digest`                | Per-message landlord digest |
| `*/15 * * * *`  | `/api/cron/synthetic-en-listing`                   | i18n regression guard (issue #49) |

Adding a new cron is a one-line entry in each table.

## Synthetic monitoring

Runbook: `docs/runbooks/synthetic-en-listing.md`.

`/api/cron/synthetic-en-listing` runs **5 independent canaries** every 15 min,
each soft-failing into a per-check report:

1. `en-listing-locale` — `/en/listing/<SYNTHETIC_LISTING_ID>` contains
   `EN_MARKERS_REQUIRED` and none of `EL_MARKERS_FORBIDDEN`. Update those
   constants at the top of `route.js` whenever gate copy changes.
2. `listing-api-distances` — `/api/listings/<id>` returns ≥2 distinct
   `walk_minutes` across `faculty_distances`.
3. `soft-404` — `/listing/does-not-exist` returns HTTP 404.
4. `og-default` — `/og-default.png` serves with `image/png` content-type.
5. `missing-message` — `/en` body contains no `MISSING_MESSAGE:` substring
   (catches missing en.json keys).

Failure path emails `SYNTHETIC_ALERT_EMAIL` via Resend — currently
**logs-only in production** because the parent `studentx.gr` domain is
unregistered (NXDOMAIN). PR #51 (`fix(email): send from
alerts@updates.studentx.gr`) is **closed** pending domain registration.
Failures still surface in `wrangler tail`.

## Database (Supabase)

- **Postgres + Auth + Storage + Realtime.** Inquiries use Supabase realtime channels.
- **Migrations:** `supabase/migrations/` (NOT a top-level `migrations/`).
  Numbered (`001_*` through `035_*`); CI applies them on every PR via
  `.github/workflows/migration-check.yml` (PR #45) using `supabase start`.
- **Star schema** (see `docs/schema.md`). `listings` is the fact table;
  `listings.location_id → location`, `listings.rent_id → rent`,
  `listings.landlord_id → landlords`. `transformListing.js`
  flattens joined rows for API responses (address, lat/lng, neighborhood,
  monthly_price, currency, deposit, contact_info, verified_tier, …).
- **`faculty_distances`** is precomputed (walk_minutes, transit_minutes per
  listing × faculty pair). `scripts/compute_distances.py` is the manual
  populator; the `recompute-distances` cron runs the same pace model from
  inside the Worker to heal newly-added/edited listings.
- **RLS guards every user-touching table.** Server code uses
  `getSupabaseWithToken(token)` (token-scoped) for any read that should
  honour the caller's permissions; the unscoped `getSupabase()` anon client
  is fine for already-public reads.
- **Auth helpers** (`src/lib/requireStudent.js`):
  `requireStudent()` returns `{ student, user, supabase, token }`,
  `{ kind: 'wrong-role' }` (signed in, but not as a student), or `null`.
  Wrapped in `React.cache()` so layout + page share one round-trip.
  `requireLandlord()` mirrors it for landlord-side surfaces.

## Email (Resend)

**Currently broken in production.** All Resend sends silently fail because
`studentx.gr` is unregistered → no domain to verify → Resend rejects every
send. Affected paths (each wrapped in try/catch, so the surrounding flow
keeps working):

- Synthetic check alerts (`/api/cron/synthetic-en-listing`)
- Saved-searches digest (`/api/cron/saved-searches-digest`)
- Landlord message digest (`/api/cron/landlord-message-digest`)
- Inquiry notifications (`src/lib/inquiryEmail.js`)

**Workaround for testing:** `onboarding@resend.dev` is Resend's free testing
sender, but it only delivers to the Resend account-owner email — it doesn't
unblock user-facing notifications.

**Permanent fix** requires registering `studentx.gr` (or another domain),
verifying it in Resend, and setting `RESEND_API_KEY` as a Worker secret.
A sibling PR is authoring `docs/runbooks/domain-setup.md` with the full
registration → DNS → Resend verification flow; until that lands, see the
**Domain context** section of `docs/runbooks/synthetic-en-listing.md`.

## Tests

**None.** No `__tests__/` directory, no `test` script in `package.json`, no
test runner in `devDependencies`. Vitest scaffolding is planned as a separate
PR. Until then, the synthetic monitor + CI build + `migration-check`
workflow are the only automated guards.

## CI

`.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml`                | PR + push to main          | `npm ci && npm run lint && npm run build` |
| `migration-check.yml`   | PR touching `supabase/**`  | `supabase start` (applies every migration in a clean local stack) |
| `claude.yml`            | Issue/PR mentions          | Claude Code GitHub Action |
| `claude-code-review.yml`| PR opened/updated          | Automated PR review (write scope per PR #55) |

**Cloudflare Workers Build** runs on every push to `main` separately —
configured in the Cloudflare dashboard, NOT under `.github/workflows/`. It
runs `npm run cf:build` and deploys to the `studentx` Worker.

## Sub-agent worktrees

`.claude/worktrees/` is gitignored (PR #53). Parallel agents work in isolated
git worktrees under that path; each branches off `origin/main` and opens its
own PR. Don't commit anything inside `.claude/worktrees/`.

## Common commands

Local dev:
```bash
npm run dev           # next dev (no Worker emulation)
npm run lint          # eslint
npm run build         # next build (catches type/lint regressions, not OpenNext)
```

OpenNext / Cloudflare:
```bash
npm run cf:build      # opennextjs-cloudflare build (writes .open-next/)
npm run preview       # cf:build + opennextjs-cloudflare preview (local Worker)
npm run deploy        # cf:build + opennextjs-cloudflare deploy (prod)
```

Wrangler:
```bash
wrangler tail                            # stream prod Worker logs
wrangler secret put NAME --name studentx # set a Worker secret
wrangler deployments list --name studentx
```

Manual cron trigger (uses `CRON_SECRET`):
```bash
curl -X POST -H "x-cron-secret: $CRON_SECRET" \
  https://studentx.studentx-gr.workers.dev/api/cron/synthetic-en-listing
```

## Style / conventions

- **JS, not TS.** No `.ts` / `.tsx` files; no `tsconfig.json` runtime config.
- **Functional React + server components by default.** Add `'use client'`
  only when the file needs hooks, browser APIs, or event handlers.
- **Path alias `@/...`** maps to `src/...` (e.g. `@/lib/requireStudent`).
- **Tailwind v4** with custom palette: `gold`, `blue`, `night`, `parchment`,
  `stone`. Display face EB Garamond, body face Source Sans 3 (both Greek +
  Latin subsets, self-hosted via `next/font/google`).
- **next-intl** for all user-visible strings. Greek strings stay in
  `src/messages/el.json`, English in `src/messages/en.json`. Adding a key
  to one without the other will fire the `missing-message` synthetic canary.
- **Security headers + CSP are enforced globally** (`next.config.mjs`).
  Updates to image hosts need a peer entry in `images.remotePatterns` AND
  the CSP `img-src` allowlist. Audit summary lives in the file's top comment.

## Where to ask questions

- Issues: <https://github.com/MichaelChar/StudentX/issues>
- PR descriptions are usually rich — `gh pr view <n>` is a good first stop
  when chasing why a piece of code is the way it is.
- Recent merged PRs (last 30) cover student accounts (#38), inquiry chat
  (#39, #40, #47), distances (#34, #60), the i18n fix (#48) + its synthetic
  guard (#50), CSP enforcement (#58), and the curated landmark expansion
  (#56, #59). Skim that list before assuming something is broken vs. recently
  reshaped.
