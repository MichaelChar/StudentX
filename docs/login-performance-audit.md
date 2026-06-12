# Login Flow Performance Audit

**Date:** 2026-06-12
**Scope:** Student login (`/student/login`) and landlord login
(`/property/thessaloniki/landlord/login`) — from first page load through
to a usable account page / dashboard.
**Method:** Static trace of every network leg in the code, plus live
timing probes against prod (`studentx.uk`, Cloudflare Worker) and
Supabase (`ecluqurlfbvkxrnoyhaq.supabase.co`). Probes were safe
(no real sign-ins): bad-credential auth POSTs, invalid-token cookie
syncs, unauthenticated API hits. All numbers are from one machine
outside Greece; absolute values for a student on Greek mobile will be
higher, but the *ratios between legs* hold.

> Prior art: PR #176/#178 already fixed round one (local JWKS JWT
> verification, `/api/health` isolate warm-up, guarded pre-login
> signOut, two-stage button label). This audit is round two — what's
> left is **waterfall structure**, not slow individual endpoints.

---

## 1. Measured baselines (warm, 5 samples each)

| Probe | TTFB range | Notes |
|---|---|---|
| `GET /api/health` (Worker baseline) | 73–225 ms | first hit of a batch ~2–3× the rest |
| `GET /student/login` (full SSR) | 101–214 ms | 51.5 KB HTML, `private, no-store` |
| `GET /landlord/login` (full SSR) | 90–160 ms | 54 KB HTML, `private, no-store` |
| Supabase `auth/v1/token` (password grant) | 160–384 ms | the `signInWithPassword` leg |
| `POST /api/auth/session` (network-fallback path) | 171–535 ms | valid tokens verify locally → ~Worker baseline |
| `GET /api/auth/me` (no DB work) | 67–167 ms | +1 Supabase RT (~100–200 ms) when authed |
| Supabase REST ping | 76–174 ms | per-query floor for Worker→Supabase |

**Server-side latency is healthy.** No single endpoint is slow. DB
indexes for the auth lookups exist (`students_auth_user_id_key`,
`landlords_auth_user_id_key` — both unique). The slowness users feel is
the *number of sequential legs*, plus cold-start and client JS weight on
first load.

A consistent **first-request penalty (~2–5×)** shows in every probe
batch — Worker isolate cold start + connection setup. The `/api/health`
warm-up (PR #176) hides this for the *submit*, but not for the login
page's own first paint.

---

## 2. The waterfalls as shipped

### Student login (happy path, after clicking Sign in)

```
1. getSession()                      ~0 ms      (localStorage)
2. signInWithPassword                160–400 ms (Supabase Auth)
3. POST /api/auth/session            80–250 ms  (cookie sync — BLOCKS)
4. POST /api/student/profile         150–400 ms (idempotent probe — BLOCKS, no-op on happy path)
5. router.push('/student/account')   100–300 ms (RSC: requireStudent = local verify + 1 SELECT)
   …or window.location.assign(next)  FULL page reload when ?next= is set
6. Destination mount: Navbar /api/auth/me + /api/me/unread;
   SessionSync re-POSTs /api/auth/session (duplicate of leg 3)
```

≈ **0.6–1.4 s warm / 2–5 s on cold isolate or weak mobile network.**
Legs 3 and 4 are independent (both use the fresh token directly) but run
sequentially. Leg 4 exists only to catch the rare landlord-email
collision — which `requireStudent`'s wrong-role redirect already handles
server-side.

### Landlord login

```
1. getSession()                       ~0 ms
2. signInWithPassword                 160–400 ms
3. GET /api/auth/me  (role probe)     200–400 ms (Worker + 2 parallel SELECTs — BLOCKS)
4. router.push(dashboard)             100–300 ms (HTML/RSC; page is 'use client')
5. LandlordShell gate: getSession + GET /api/landlord/profile
                                      200–400 ms (BLOCKS — full-screen BauhausLoader
                                                  until the *greeting name* fetch returns)
6. Dashboard mounts → 5 parallel fetches (listings / inquiries /
   analytics / response-time / subscription)
                                      250–600 ms (slowest of 5; each pays its own
                                                  Worker hop + auth verify)
7. Content renders
```

≈ **0.9–2.0 s warm / 3–6 s cold or on mobile.** Three full sequential
phases (probe → gate → data) where the student side at least streams.
Leg 3 duplicates the dashboard's own server guard. Leg 5 blocks
everything behind a *cosmetic* fetch (the topbar greeting). Leg 6 can't
start until 5 finishes.

### First page load (before the user can even type)

- Login routes are `private, no-cache, no-store` (blanket `/student/*`
  and `/landlord/*` rules) → every visit is a full Worker SSR, never
  edge-cached, and the **first visit pays the isolate cold start** — the
  `/api/health` warm-up only fires after the page has already loaded.
- The student login page ships **~321 KB compressed JS in 14 chunks**
  (~1 MB+ parsed) — heavy for a credentials form. Contributors: `motion`
  (EncryptButton scramble + Navbar dropdown animation), the Supabase
  client, next-intl + the **full 39 KB message catalog inlined into the
  HTML** (every page gets every namespace via `NextIntlClientProvider`).
  On a mid-range phone, download + hydration adds real seconds before
  the form is interactive.

---

## 3. Findings (ranked by user-felt impact)

| # | Finding | Where | Cost |
|---|---|---|---|
| F1 | Post-submit legs run sequentially though most are independent or redundant | both login pages | 300–800 ms per login |
| F2 | Landlord dashboard is triple-gated client-side: role probe → shell gate (blocks on greeting fetch) → 5 data fetches | `LandlordShell.js:41-70`, dashboard `page.js:112-126`, login `page.js:80-100` | 500–1200 ms after auth |
| F3 | ~321 KB JS + 39 KB inlined catalog on a login form; hydration cost on mobile | login pages / `[locale]/layout.js:87` | seconds on mid-range phones (first visit) |
| F4 | First paint of the login page pays Worker cold start; warm-up ping fires too late to help it | `next.config.mjs` private rules + OpenNext | 200–500 ms+, first visit only |
| F5 | `?next=` logins navigate via `window.location.assign` → full reload, re-downloading/executing all JS | student login `page.js:131-138` | 0.5–1.5 s when coming from AuthGate |
| F6 | SessionSync re-POSTs `/api/auth/session` right after login already did | `SessionSync.js:51-59` | minor (off critical path), wasted Worker invocations |
| F7 | `withTimeout` 15 s × 2 attempts → worst-case ~30 s frozen flow on a hung leg | `withTimeout.js`, login handlers | tail-latency UX |
| F8 | Supabase advisors: `auth_rls_initplan` on `student_favorites` policies; multiple permissive SELECT policies on `inquiries`, `listing_amenities`, `location`, `rent` | RLS | negligible at 22 listings; grows with data |

---

## 4. Recommendations

### Quick wins (small diffs, ship first)

1. **Parallelise / unblock the student post-submit legs.**
   `Promise.all` the cookie sync (leg 3) and profile probe (leg 4) —
   they're independent. Better: make the probe fire-and-forget and let
   `requireStudent`'s existing wrong-role redirect own the rare conflict
   case. Saves 150–400 ms per login. *(login `page.js:83-129`)*

2. **Drop the landlord pre-redirect role probe.** Navigate to the
   dashboard immediately after `signInWithPassword`; the server-side
   `requireLandlord` guard already bounces wrong-role users back to
   login with `?roleConflict=student`, which the login page already
   renders. Saves 200–400 ms. *(landlord login `page.js:80-104`)*

3. **Don't block LandlordShell on the greeting fetch.** Set
   `sessionReady` right after `getSession()`; let the profile-name
   fetch resolve into state when it lands. Saves 200–400 ms of
   full-screen loader. *(`LandlordShell.js:59-68`)*

4. **Prefetch the destination while the user types.** Next to the
   existing `/api/health` warm-up in the mount effect, add
   `router.prefetch('/student/account')` / `router.prefetch(dashboard)`.
   The RSC payload is then already cached when `push` happens.

5. **Use client navigation for `?next=`.** The plain
   `next/navigation` router accepts query strings; use it for `safeNext`
   instead of `window.location.assign` to avoid the full reload.
   (Keep `assign` as fallback only if the i18n-wrapper limitation is
   confirmed to apply to the raw router too.)

6. **Dedupe SessionSync.** Remember the last-synced token in module
   scope and skip the POST when unchanged.

### Structural (bigger wins, medium effort)

7. **Single server-side login endpoint.** `POST /api/auth/login
   { email, password, role }`: the Worker does the password grant
   against Supabase, validates role, ensures the profile row (student
   RPC), sets the cookie, and returns `{ session, role, redirect }`;
   the client calls `supabase.auth.setSession(session)` and navigates.
   Collapses 3–4 client→server round-trips into **one**, and the
   Worker→Supabase hops inside it are cheap (JWKS already cached).
   Estimated 30–50 % cut of submit-to-destination time, and it
   centralises the role-conflict logic both pages currently duplicate.

8. **Convert the landlord dashboard to the student-account pattern.**
   Server component + `requireLandlord` + `<Suspense>`-streamed
   sections (the account page at
   `src/app/[locale]/student/account/page.js` is the in-repo
   reference). Shell paints on first byte; the 5 widget queries run
   in parallel *on the server* (no per-fetch Worker hop + auth
   re-verification) and stream in. This is the single biggest landlord-
   side win and retires F2 entirely.

9. **Trim the login bundle.**
   - Pass only the needed namespaces to `NextIntlClientProvider`
     (e.g. `pick(messages, ['nav', 'student.login', 'landlord.login',
     'loaders', …])` per layout) instead of the full 39 KB catalog.
   - Replace or `next/dynamic`-import `EncryptButton`'s `motion`
     dependency on auth pages (the scramble effect is `setInterval` —
     the `motion.button` wrapper is only scale-on-hover, achievable in
     CSS).
   - Run `@next/bundle-analyzer` once to confirm what's in the 70 KB
     and 57 KB shared chunks; make sure Leaflet/d3/topojson never leak
     into the shared layout chunk.

### Experiments / hygiene

10. **Try edge-caching the login page shell.** The login HTML is
    identical for every visitor (all auth state is client-side). If a
    dedicated header rule for the two login routes
    (`public, s-maxage=300`) survives OpenNext's force-private
    behaviour (CLAUDE.md "OpenNext quirks" #1 — verify with `curl`
    after deploy), first paint becomes a CDN hit and F4 disappears.
    If OpenNext force-privates it, skip — don't fight the platform.
11. **Consider Smart Placement** (`"placement": { "mode": "smart" }`
    in `wrangler.jsonc`). Helps any handler making multiple sequential
    Supabase calls (the unified login endpoint in #7, account RSC).
    Free to enable; measure before/after, revert if neutral.
12. **Tighten timeouts on auth legs.** 8 s (not 15 s) for
    `signInWithPassword` and the cookie sync, keeping the single retry.
    Worst case drops from ~30 s to ~16 s.
13. **RLS hygiene migration** (advisor warnings): wrap `auth.uid()` as
    `(select auth.uid())` in the three `student_favorites` policies;
    consolidate the duplicate permissive SELECT policies on
    `inquiries`, `listing_amenities`, `location`, `rent`. Negligible
    today, cheap insurance for growth.
14. **Add timing telemetry before optimising further.** Beacon the
    per-stage durations (auth / cookie-sync / probe / nav) from the
    login handlers to the existing `/api/log-client-error`-style
    endpoint so the next round is driven by real Thessaloniki-mobile
    numbers instead of probes from a dev machine.

---

## 5. Expected outcome

| Flow | Today (warm) | After quick wins | After structural |
|---|---|---|---|
| Student: submit → account usable | ~0.6–1.4 s | ~0.45–1.0 s | ~0.3–0.7 s |
| Landlord: submit → dashboard usable | ~0.9–2.0 s | ~0.6–1.3 s | ~0.4–0.8 s |
| Login page first paint (cold, mobile) | seconds | — | sub-second if #9/#10 land |

Cold-isolate and weak-network cases improve proportionally more, since
every removed round-trip also removes a retry/timeout opportunity.
