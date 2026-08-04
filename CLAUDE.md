# CLAUDE.md

Single-page orientation for Claude / agent sessions working in this repo.
Keep this file accurate when conventions change. Rule of thumb: record
**invariants and gotchas**, not counts or versions — anything the repo
counts for you (migration numbers, test totals, dependency versions)
goes stale here and misleads agents. Point at the authoritative source
instead.

## Project overview

**StudentX** is a student-services platform for Thessaloniki, Greece
(English-only UI). The original core is a curated student-housing
directory (`/property`): students browse listings filtered by faculty +
commute time; landlords manage listings and reply to inquiries. Not an
open marketplace — every listing is curated and verified.

Around that core sit the monetizing / retention surfaces:

- **`/gigs`** — student-services marketplace (browse, results, detail;
  inquiries via `gigInquiryEmail.js`). The housing directory is the lead
  magnet; gigs monetize both students and landlords.
- **`/resources`** — filterable resources hub (spec in
  `docs/resources-hub-spec.md`).
- **`/student/ausom`** — AUSoM practice tests + flashcards (authoring
  docs in `docs/practice-tests/`, test JSON in `content/practice/`
  (bundled at build time via `src/lib/practice/manifest.generated.js`),
  question media in `public/practice/`, players in
  `src/components/practice/`).
- **`/admin`** — dashboard, landlord verifications, metrics,
  practice-reports.
- **`/claim/[token]`** — token-based listing-claim flow for landlords.

## Tech stack

- **Framework:** Next.js `16.x` (App Router, JS — no TypeScript), React `19.x`.
- **i18n:** `next-intl@^4` (English only as of #158 / Step B — was bilingual `el` + `en`).
- **Backend:** Supabase (`@supabase/supabase-js@^2`) — Postgres + Auth + Storage + Realtime.
- **Email:** Resend (`resend@^4`) — live in prod, see Email section.
- **Payments:** Stripe (`stripe@^22`) — landlord plans + verified-tier upgrades.
- **Maps:** Leaflet + `react-leaflet@^5`; OSM tiles; topojson + d3-geo for region shapes.
- **CSS:** Tailwind v4 (`tailwindcss@^4` + `@tailwindcss/postcss`).
- **Hosting:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare@^1.20`),
  `wrangler@^4`. Live on `https://studentx.uk`; the Workers URL
  `https://studentx.studentx-gr.workers.dev` still resolves.
- **Lint:** `eslint@^9` + `eslint-config-next`.

> `package.json` is authoritative for exact versions — check it, don't
> trust this list beyond the major.

## Repo layout

```
.
├── CLAUDE.md                    ← this file
├── next.config.mjs              ← security headers, CSP (enforced), cache policy
├── wrangler.jsonc               ← Worker name, vars, cron triggers
├── cf/
│   └── worker-entry.mjs         ← Worker shim adding `scheduled` handler
├── src/
│   ├── app/
│   │   ├── [locale]/            ← the whole page tree (locale segment is implicit)
│   │   │   ├── property/        ← hub + [city]/{about,landlord,landlords,listing,quiz,results}
│   │   │   ├── gigs/            ← services marketplace (hub, results, [id])
│   │   │   ├── resources/       ← resources hub
│   │   │   ├── student/         ← auth + account + inquiries + ausom (practice tests, flashcards)
│   │   │   ├── admin/           ← dashboard, verifications, metrics, practice-reports
│   │   │   ├── claim/[token]/   ← landlord listing-claim flow
│   │   │   └── about/
│   │   ├── api/                 ← API routes (no locale prefix)
│   │   │   └── cron/            ← scheduled-handler endpoints
│   │   ├── layout.js, sitemap.js, robots.js
│   ├── middleware.js            ← next-intl + auth-cache split + legacy /property URL 301s (PR #113)
│   ├── components/              ← React components (server-default, 'use client' only when needed)
│   ├── i18n/{routing.js, request.js, navigation.js}
│   ├── lib/                     ← server helpers (supabase, requireStudent, transformListing,
│   │                              cityRoutes, *Email.js — email HTML is inlined here, …)
│   └── messages/en.json         ← next-intl message catalog (English-only; el.json removed in #158)
├── supabase/
│   ├── migrations/              ← numbered SQL migrations (see Database section for numbering rules)
│   ├── config.toml, seed.sql
├── content/
│   └── practice/ausom/          ← practice-test JSON source (per-subject index.json + test files;
│                                  bundled via src/lib/practice/manifest.generated.js —
│                                  regenerate with `npm run practice:manifest`)
├── public/practice/             ← static question media only (jpg/mp4/html screenshots)
├── docs/
│   ├── runbooks/                ← operational runbooks
│   ├── practice-tests/          ← practice-test authoring conventions
│   ├── resources-hub-spec.md, schema.md, ingestion-guide.md, …
├── scripts/                     ← Python ingest pipeline + one-off data scripts
├── templates/                   ← batch_template.csv (listing ingest); email HTML lives in src/lib
└── .github/workflows/           ← CI (ci.yml, claude*.yml, migration-check.yml)
```

`.claude/worktrees/` is gitignored (PR #53) — used by parallel sub-agents.

## Locale routing

`src/i18n/routing.js`:

```js
locales: ['en']
defaultLocale: 'en'
localePrefix: 'never'  // all URLs unprefixed; /en/* and /el/* 301 to /*
```

Greek was removed from the platform in issue #158 / Step B (PR following
#157). The single-locale config keeps the `[locale]` route segment in
the file tree (next-intl injects `'en'` silently) but no URL ever
carries a locale prefix in or out. `src/messages/el.json` and the
`src/app/property/` redirect-stub tree (which forwarded unprefixed
URLs to `/el/...`) are gone. The settings UI's email-language picker
and the navbar `LocaleSwitcher` component are gone too.

The middleware lives at **`src/middleware.js`**. Next 16 + Turbopack only
picks up the file when it sits at the same level as `app/`, so the
legacy repo-root location is silently ignored when `src/app/` is in use
(verified in PR #113 — the original `middleware.js` at the root was
dormant in dev mode and only worked at build/deploy time, leaving the
URL redirect logic effectively off). It runs `createMiddleware(routing)`
plus a 301 layer for legacy `/property/{results,quiz,listing,landlord,
about,alerts}/...` → `/property/thessaloniki/...` URLs, with matcher
`'/((?!api|_next|_vercel|.*\\..*).*)'`.

**`middleware.js` vs `proxy.js` (Next 16):** the new convention is
`proxy.js` with a named export `proxy`, but `proxy` runs on the
**nodejs** runtime and OpenNext-on-Cloudflare-Workers requires edge —
`npm run cf:build` errors with `"Node.js middleware is not currently
supported. Consider switching to Edge Middleware."` if you switch.
Stay on the deprecated-but-fully-supported `middleware.js` filename
and named export `middleware` to keep edge.

`/property/thessaloniki/listing/<id>` resolves to
`src/app/[locale]/property/[city]/listing/[id]/page.js` (the locale
segment is implicit). Visiting an unsupported city slug 404s via
`notFound()` in `[locale]/property/[city]/layout.js`; the allowlist is
`SUPPORTED_CITIES` in `src/lib/cityRoutes.js` (PR #113).

Old single-city URLs (`/property/results`, `/property/landlord/login`,
etc.) 301 to their `/property/thessaloniki/...` equivalents via the
middleware. Pre-`/property` legacy paths (`/results`, `/listing/:id`,
`/landlord/...`, `/alerts/...`) 308 directly to the `/thessaloniki/`
destination via `next.config.mjs#redirects()` to avoid 2-hop chains.
Any `/en/*` or `/el/*` URL 301s to its unprefixed equivalent via two
catch-all entries in the same `redirects()` block.

## i18n calling convention (READ THIS BEFORE TOUCHING SERVER COMPONENTS)

The `<html>` element lives in `src/app/[locale]/layout.js` (not the root
`src/app/layout.js`) so `lang={locale}` is set from `params`. With one
locale this is mostly belt-and-braces, but the inherited pattern from
when the site was bilingual is still in place. Calling `getLocale()` in
the root layout previously poisoned next-intl's per-request config
cache (PR #110 fixed it). The root layout stays a minimal pass-through.

Conventions still in force:

- **Always pass `locale` explicitly to `getTranslations`** in server
  components, even though the request-scope path is now reliable:

  ```js
  const t = await getTranslations({ locale, namespace: 'student.gate' });
  ```

  Self-documenting at the call site and avoids re-introducing dependence
  on the request scope. With one locale the value is always `'en'`, but
  the explicit form is cheap and keeps the option open if Greek (or any
  other locale) ever comes back.

- **`AuthGate` takes `locale` as an explicit prop.** Its JSDoc explains
  why — any component rendered inside a redirect or guard branch should
  not assume request scope.

- **When a server component receives `params`, call
  `setRequestLocale(locale)` near the top** — see
  `src/app/[locale]/property/[city]/listing/[id]/page.js`. Belt-and-braces
  with one locale; stay in the habit.

## OpenNext-on-Workers quirks

1. **Auth-touching pages don't get CDN caching, regardless of `next.config.mjs`.**
   `next.config.mjs` declares `public, s-maxage=300, stale-while-revalidate=86400`
   for marketing routes and `private, no-cache, no-store, must-revalidate` for
   `/landlord/*`, `/listing/*`, `/student/*`.
   Verified via `curl` on prod: public pages get the public header correctly;
   auth-touching pages get `private, no-cache` regardless of any `s-maxage`
   config — OpenNext / Workers force-private any response from a route that
   touches request-scoped APIs (cookies, headers).

2. **OpenNext v1.x doesn't ship a `scheduled` handler.** `cf/worker-entry.mjs`
   wraps `.open-next/worker.js` to add one and re-exports the Durable Object
   classes (`DOQueueHandler`, `DOShardedTagCache`, `BucketCachePurge`) that
   Cloudflare requires at module top level.

3. **The locale page tree is force-dynamic — do not re-add prerendering/ISR.**
   Prerendered pages caused intermittent Cloudflare error 1101 ("cross-request
   I/O") in prod; fixed in #316 by making the `[locale]` tree fully dynamic.
   Re-enabling ISR/prerendering requires first wiring OpenNext's R2 incremental
   cache (available on `@opennextjs/cloudflare` ≥ 1.20 — which we now run, but
   the R2 cache is NOT configured). Without it, the 1101s come back.

## Cron architecture

Four pieces must stay in sync:

| Piece | File | What it holds |
|---|---|---|
| Cron triggers | `wrangler.jsonc` `triggers.crons` | Cron expressions Cloudflare fires (single master tick) |
| Cron dispatch | `cf/worker-entry.mjs` `CRON_ROUTES` | Cron expression → `{ name, path, query }` |
| Job registry | `src/app/api/cron/tick/route.js` `CRON_JOBS` | Per-job name, cadence, handler |
| Live schedules | Cloudflare API `/workers/scripts/studentx/schedules` | What CF actually fires (deploy pipeline doesn't sync this — see PR #150) |

**W9 master tick.** One Cloudflare trigger (`*/5 * * * *`) POSTs
`/api/cron/tick`. The route holds a job registry; each job declares its
own cadence (`5m` | `15m` | `daily@HH:MM`). Dueness is pure wall-clock
(`getUTCMinutes` / `getUTCHours`) — no persistent scheduler state. Due
jobs run via `Promise.allSettled` with a per-job timeout inside a 25s
outer `AbortSignal.timeout`. One failing job never blocks siblings.
Each job logs `job=… outcome=… durationMs=…` for `wrangler tail`.

The `scheduled` handler looks up `event.cron` in `CRON_ROUTES`, then invokes
OpenNext's `fetch` directly (no network self-call — see PR #133's findings).
`ctx.waitUntil()` keeps the Worker alive past the synchronous return.

**Cloudflare Free plan caps a Worker at 5 cron triggers** — the 6th is
silently rejected at registration time with API error 10072 (confirmed in
PR #150 after the student-message-digest trigger had been silently dropped
for 3 days). The master tick uses 1 of 5; add new timers as registry
entries, not new CF triggers.

**The deploy pipeline does NOT sync trigger changes.**
`opennextjs-cloudflare deploy` pushes the script bundle but leaves
`/schedules` untouched. After any edit to `wrangler.jsonc.triggers.crons`,
re-PUT the live schedules via the CF API or `wrangler deploy`, then verify
drift — the procedure (including the drift-check `curl`) is in
`docs/runbooks/cron-schedule-sync.md`.

**All cron routes auth via `CRON_SECRET`** — accepted via either the
`x-cron-secret` header OR `?secret=` query param. `CRON_SECRET` is a Worker
secret, set with `wrangler secret put CRON_SECRET --name studentx`.

Cloudflare trigger (`wrangler.jsonc` / `CRON_ROUTES` / live schedules):

| Cron expression | Route | Purpose |
|---|---|---|
| `*/5 * * * *` | `/api/cron/tick` | Master tick — runs due registry jobs |

Registry jobs (`CRON_JOBS` in `/api/cron/tick`):

| Job name | Cadence | Purpose |
|---|---|---|
| `recompute-distances` | `daily@09:15` | Heal missing `faculty_distances` rows (PR #60). |
| `message-digest` | `5m` | Landlord + student per-message digests (merged). |
| `synthetic-en-listing` | `15m` | Synthetic uptime/regression canaries (issue #49). |

Old per-job paths (`/api/cron/recompute-distances`,
`landlord-message-digest`, `student-message-digest`,
`synthetic-en-listing`) remain as thin wrappers over the same handlers
for manual curls.

Adding a new cron is a one-line entry in `CRON_JOBS` (name, cadence,
handler). No `wrangler.jsonc` edit and no schedule sync unless you are
changing the master-tick expression itself.

## Synthetic monitoring

Runbook: `docs/runbooks/synthetic-en-listing.md` — read it before editing
the canary; it documents every check.

`/api/cron/synthetic-en-listing` runs independent canaries every 15 min,
each soft-failing into a per-check report: listing-page content markers
(`EN_MARKERS_REQUIRED` — update that constant whenever gate copy changes),
listing-API distance sanity, soft-404 behaviour, og-image serving,
landlord-API auth (401-not-5xx — guards the column-missing crash class
fixed in PR #85), and a `MISSING_MESSAGE:` scan for missing en.json keys.

Failures email `SYNTHETIC_ALERT_EMAIL` via Resend (live in prod) and
surface in `wrangler tail`.

## Database (Supabase)

- **Postgres + Auth + Storage + Realtime.** Inquiries use Supabase realtime channels.
- **Migrations:** `supabase/migrations/` (NOT a top-level `migrations/`),
  numbered `NNN_name.sql`. CI applies them on every PR via
  `.github/workflows/migration-check.yml` (PR #45) using `supabase start`.
- **Never reuse an `NNN` prefix, even for unrelated migrations.**
  `supabase start` keys `schema_migrations` on the filename's leading
  digits, so two files sharing a number fail the clean-stack apply with
  `duplicate key ... schema_migrations_pkey`. Worse, the collision hides
  ordering bugs: a duplicate pair can put a fix before a later migration
  that reverts it. Both happened — see migrations 067 and 068, which were
  renumbered out of 051/052 for exactly this.
- **Prod has migration drift — number new migrations off prod's highest
  *applied* migration, not the repo's highest file.** Prod has applied
  migrations that have no corresponding repo file, so the repo cannot
  fully recreate prod. Check `mcp__supabase__list_migrations` (or
  `supabase migration list --linked`) before picking a number.
- **The shared Supabase project holds unrelated tables.** The same
  project also contains another app's tables (e.g. `users.password_hash`,
  `credentials.encrypted_data`). Never assume every table is StudentX's;
  never write migrations or RLS sweeps that touch tables you don't
  recognise from `docs/schema.md`.
- **Migration ordering — apply to prod BEFORE merging the consuming PR.**
  Cloudflare deploys on push-to-main; if a PR adds/renames a column
  referenced by a SELECT, the deploy reaches prod ahead of the migration
  and any route touching the column 500s in the gap. `migration-check.yml`
  now has a fail-closed `applied-to-prod` job that verifies any migration
  in the PR is already applied to prod — but it is **advisory**: only the
  build job and Cloudflare Workers Build are required to merge, so a red
  gate won't block you (and drop-after-deploy migrations go red by
  design). Convention: apply to prod (`mcp__supabase__apply_migration` or
  `supabase db push --linked`) during PR review, paste the confirmation
  into the PR, then merge. Affected routes should still be defensive —
  see the fallback-SELECT pattern in `src/app/api/listings/route.js` and
  `src/app/api/landlord/listings/route.js` (PR #85, post-incident).
- **`listings.listing_status = 'active'` is admin-only, and its default is
  `disabled` (104).** Public visibility is granted solely by
  `/api/admin/listing-go-live`, which requires the listing to be submitted,
  the landlord to be ID-verified (`landlords.is_verified`), and a completed
  video-call `property_verifications` row. No landlord-reachable write path
  may set `active` — the PATCH route deliberately ignores a client-supplied
  `listing_status`. The wizard stage lives separately in `flags.listing_status`
  (`draft` → `submitted` → `live`), with the approval stamped as
  `flags.admin_live_approved`. All of it derives from `src/lib/listingGoLive.js`
  — don't reimplement the gate inline. **Any INSERT that wants a visible row
  must set `listing_status` explicitly**; `supabase/seed.sql` does.
- **The Python batch-ingestion pipeline is disabled.** `scripts/ingest.py` and
  `scripts/apply_and_load.py` exit via `scripts/_ingestion_disabled.py`,
  because ingested listings can satisfy neither go-live gate (no landlord ID
  check, no video call) and would land invisible and unpublishable. Re-enabling
  needs a curated-source exemption in `canAdminGoLive()` or an explicit
  `listing_status='active'` stamp — see the banner in `docs/ingestion-guide.md`.
  `INGESTION_ENABLED=1` overrides the guard for a one-off run.
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

**Live in production.** `studentx.uk` is verified in Resend (DKIM/SPF/DMARC
records on the CF zone) and `RESEND_API_KEY` is set as a Worker secret.
Outbound paths sending from `alerts@studentx.uk`:

- Synthetic check alerts (`/api/cron/synthetic-en-listing`)
- Landlord message digest (`/api/cron/landlord-message-digest`)
- Student message digest (`/api/cron/student-message-digest`)
- Inquiry notifications (`src/lib/inquiryEmail.js`)
- Gig inquiry notifications (`src/lib/gigInquiryEmail.js`)

Suppression handling lives in `src/lib/emailSuppressions.js`. Email HTML
is inlined in those lib files (the old `templates/*.html` are gone).
The DNS + verification flow is documented in `docs/runbooks/domain-setup.md`.

## Tests

**Vitest.** `npm run test` (alias for `vitest run`); `npm run test:watch`
for a live runner. Tests live under `__tests__/` mirroring `src/`.
The path alias `@/...` works in tests via `vitest.config.js`.

When a `lib/` file's public shape changes (e.g. adding a field to
`transformListing`), check `__tests__/lib/<name>.test.js` for a snapshot
that needs updating. CI's `build` job runs `npm run test` between lint
and build, so a stale fixture fails the PR before it gets to migration
check.

When a migration ships that adds a NOT NULL column to `listings` (or any
seeded table), `supabase/seed.sql` must supply a value for that column —
otherwise `supabase start` (run by `migration-check.yml`) fails the
seed-load step on every PR. Migration 038 caught this the hard way.

## CI

`.github/workflows/`:

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml`                | PR + push to main          | `npm ci && npm run lint && npm run test && npm run build` |
| `migration-check.yml`   | PR touching `supabase/**`  | `supabase start` (clean-stack apply) + fail-closed `applied-to-prod` gate |
| `claude.yml`            | Issue/PR mentions          | Claude Code GitHub Action |
| `claude-code-review.yml`| PR opened/updated          | Automated PR review (write scope per PR #55) |

Only the build job and Cloudflare Workers Build are **required** to merge;
the migration gate and review workflows are advisory (see Database section
for why the gate can be legitimately red).

**Cloudflare Workers Build** runs on every push to `main` separately —
configured in the Cloudflare dashboard, NOT under `.github/workflows/`. It
runs `npm run cf:build` and deploys to the `studentx` Worker.

## Sub-agent worktrees

`.claude/worktrees/` is gitignored (PR #53). Parallel agents work in isolated
git worktrees under that path; each branches off `origin/main` and opens its
own PR. Don't commit anything inside `.claude/worktrees/`. If an agent needs
to run the app or tests, copy `.env.local` into the worktree and symlink
`node_modules`. Agents must use worktree-absolute paths in Edit/Write —
relative or main-checkout paths silently modify the main working copy.

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
  https://studentx.uk/api/cron/synthetic-en-listing
```

## Style / conventions

- **JS, not TS.** No `.ts` / `.tsx` files; no `tsconfig.json` runtime config.
- **Functional React + server components by default.** Add `'use client'`
  only when the file needs hooks, browser APIs, or event handlers.
- **Path alias `@/...`** maps to `src/...` (e.g. `@/lib/requireStudent`).
- **Tailwind v4** with a Stripe-style iris palette (tokens in
  `src/app/globals.css`): `blue` #635BFF (primary / CTAs / logo), `night`
  #0a2540 (ink / dark surfaces), `stone` #fff (canvas), `parchment` #f6f4ff
  (cards / surfaces), plus accents `magenta` #ff5fa2 and `yellow` #ffcb57.
  Legacy aliases (`navy`, `gray-dark`, `gray-light`, `font-heading`) still
  resolve via `globals.css` but new code should use the canonical tokens
  (`night`, `parchment`, `blue`, `font-display`). Inter for both display and
  body (Latin + Greek subsets, self-hosted via `next/font/google`).
- **next-intl** for all user-visible strings — no hardcoded copy in
  components. The single catalog is `src/messages/en.json`; a missing key
  fires the `missing-message` synthetic canary in prod.
- **Security headers + CSP are enforced globally** (`next.config.mjs`).
  Updates to image hosts need a peer entry in `images.remotePatterns` AND
  the CSP `img-src` allowlist. Audit summary lives in the file's top comment.

## Where to ask questions

- Issues: <https://github.com/MichaelChar/StudentX/issues>
- PR descriptions are usually rich — `gh pr view <n>` is a good first stop
  when chasing why a piece of code is the way it is.
- `gh pr list --state merged --limit 30` is a good first stop before
  assuming a piece of code is broken vs. recently reshaped.
