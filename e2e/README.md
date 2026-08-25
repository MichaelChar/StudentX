# Playwright e2e — accommodation marketplace

Browser coverage for the booking marketplace rebuilt in PRs #364–#378.
Unit tests remain Vitest-only (`npm run test`). This suite is **not** wired
into CI — deploys are already gated on Cloudflare Worker size; do not add a
second required check without an explicit decision.

## Journeys

| # | Spec | What it covers |
|---|---|---|
| 1 | `specs/01-student-discovery.spec.js` | Results browse + move-in/out filters; listing calendar, cost summary, cancellation policy, similar listings |
| 2 | `specs/02-booking-request.spec.js` | Student request-to-book; incomplete profile → `PROFILE_INCOMPLETE` + inline form; complete → 201 |
| 3 | `specs/03-landlord-accept.spec.js` | Landlord reservations; guest profile visible; **student email never on page**; accept → confirmed |
| 4 | `specs/04-student-sees-booking.spec.js` | `/student/account/bookings` status + detail link to inquiry thread |
| 5 | `specs/05-move-in-confirmation.spec.js` | Past move-in + confirmed → "Is everything as promised?" → `moved_in` |
| 6 | `specs/06-landlord-wizard.spec.js` | 7 wizard steps; map pin sets lat/lng (not typeable); &lt;2 universities blocks; &lt;5 photos blocks submit |

## Required env vars

Credentials are **env-only** — never commit them.

### App server (`.env.local` for the Next process on port 3100)

| Variable | Why |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** for booking create/accept and landlord listing APIs (`getSupabaseAsService`). Without it, journeys 2–5 fail at setup. |

### Playwright process (shell or `.env.local`)

| Variable | Why |
|---|---|
| `E2E_BASE_URL` | Default `http://localhost:3100` |
| `E2E_STUDENT_EMAIL` | Student test account email |
| `E2E_STUDENT_PASSWORD` | Student test account password |
| `E2E_LANDLORD_EMAIL` | Landlord test account email |
| `E2E_LANDLORD_PASSWORD` | Landlord test account password |
| `E2E_SKIP_WEBSERVER` | Set `1` if you already started the app and do not want Playwright to spawn `next dev` |

Optional: journey 1 (discovery) runs **without** student/landlord credentials.
Journeys 2–5 need both roles. Journey 6 needs landlord only.

Use **dedicated** accounts — not production landlords tied to the three real
curated listings. The suite creates fixture listings titled `E2E …` and
deletes them in `afterEach`.

## Isolation rules

- Every mutating journey creates its **own** listing via
  `POST /api/landlord/listings` and removes it in `afterEach` (runs on failure).
- Bookings are cancelled before listing delete so
  `listing_availability_blocks` (`pending` / `booked`) do not leak.
- Protected production listing ids are hard-blocked from mutation helpers —
  never point tests at them for writes. **The real guard is the fixture title,
  not the id list:** `deleteFixtureListing` reads the listing back and refuses
  to delete anything whose title does not start with `E2E `. An id list goes
  stale (this one named `0100001`–`0100004`, which existed in no environment,
  so it was inert for its entire life); a title check does not.
- ⚠️ **There is no dedicated e2e landlord yet.** The only landlord account the
  credentials can sign in as is `0106`, which owns every live listing in the
  public directory. That is exactly what this section says not to do. Until a
  dedicated account exists, the title guard is the only thing between a
  misbehaving teardown and the live inventory — do not weaken it.
- Workers = 1 so fixtures do not race.

If a journey cannot guarantee cleanup, it must `test.skip` rather than ship a
corrupting test.

## Commands

```bash
# From this worktree (has its own node_modules — do not symlink)
npm ci
# Optional: download Playwright's Chromium. By default the suite uses the
# system Google Chrome channel (`channel: 'chrome'`) so this step is not
# required on macOS with Chrome installed. Set E2E_USE_BUNDLED=1 after install
# to force the Playwright-managed browser.
npx playwright install chromium

# Terminal A — app under test (different port from main checkout's :3000)
# Ensure SUPABASE_SERVICE_ROLE_KEY is in .env.local for journeys 2–5
npm run dev -- -p 3100

# Terminal B — credentials exported or present in .env.local
export E2E_STUDENT_EMAIL=…
export E2E_STUDENT_PASSWORD=…
export E2E_LANDLORD_EMAIL=…
export E2E_LANDLORD_PASSWORD=…
export E2E_BASE_URL=http://localhost:3100
export E2E_SKIP_WEBSERVER=1   # if Terminal A is already up

npm run test:e2e
```

Vitest is unchanged:

```bash
npm run test          # vitest only
npm run test:e2e      # playwright only
```

## Layout

```
e2e/
  README.md
  fixtures/env.mjs      # env contract + protected listing ids
  helpers/
    api.mjs             # sign-in, fixture listing/booking, cleanup, session inject
    dates.mjs
    loadEnv.mjs
  specs/
    01-…06-*.spec.js
playwright.config.mjs
```
