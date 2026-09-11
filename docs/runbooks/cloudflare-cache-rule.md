# Runbook — the Cloudflare Cache Rule for anon `/property/*`

Issue #130. This is the dashboard half of edge caching; the repo half is the
two canary checks (`cf-cache-status-hit`, `cf-cache-authed-not-hit`) in
`synthetic-en-listing`.

## Why a rule at all

**Worker responses on a custom domain bypass Cloudflare's CDN cache. A
`Cache-Control` header alone changes nothing.** This was verified the hard way
in #261, where marking the login shells `public, s-maxage=300` produced
identical TTFB and no `cf-cache-status`, and was reverted. The only mechanism
that makes Cloudflare cache this app's HTML is a Cache Rule.

Without one, every anonymous pageview executes the Worker and queries
Supabase. With one, a repeat anonymous hit is served at the edge and the
Worker never runs — roughly 230ms → 40ms.

## The rule

**Caching → Cache Rules →** the existing rule named something like
*"Cache anon listing detail (Set-Cookie override)"* → **Edit**.

Rename it to **`Cache anon /property/* (edge)`**.

### Expression

```
starts_with(http.request.uri.path, "/property")
and not http.request.uri.path contains "/landlord"
and not http.cookie contains "sb-access-token"
```

### Action

- **Cache eligibility:** Eligible for cache
- **Edge TTL:** *Use cache-control header if present, bypass if not*

That Edge TTL setting is load-bearing and is the reason this is safe rather
than merely careful: anything the origin marks `private, no-cache, no-store`
is **bypassed automatically**, whatever the expression matched. The clauses
below are defence in depth on top of it, not the only thing standing between
you and a leak.

## Why this expression differs from the one in issue #130

The version in the issue body was written before several things changed. Do
not paste it; it has two real defects and two dead clauses.

1. **It hardcodes `thessaloniki` in the landlord exclusion.** `SUPPORTED_CITIES`
   now holds seven slugs (thessaloniki, athens, larissa, heraklion, nicosia,
   london, dublin). `/property/athens/landlord/dashboard` would not have been
   excluded. The Edge TTL setting would still have bypassed it on the private
   header, so this was latent rather than live — but relying on the header
   alone is precisely the pattern that produced #130's `/claim` scare.
   `contains "/landlord"` is city-agnostic and cannot rot this way.
2. **It cites `Set-Cookie: NEXT_LOCALE` as a blocker.** Gone — #511 removed
   `localeCookie` for exactly this reason. Prod returns zero `Set-Cookie`
   headers on `/property/thessaloniki`. Verify before trusting:
   `curl -sI https://studentx.uk/property/thessaloniki | grep -ic set-cookie`
   → `0`.
3. **The `/en/property` clauses are dead.** #158 made every `/en/*` path 301 to
   its unprefixed equivalent. Harmless but noise.
4. **`contains "/landlord"` also excludes `/property/<city>/landlords/<id>`** —
   the PUBLIC landlord profile — because "landlords" contains "landlord". That
   is a deliberate trade: a small missed caching opportunity in exchange for an
   exclusion that cannot be defeated by a new city slug. Revisit only if those
   profiles become a traffic surface.

## What is being cached, and why it is safe

Audited 2026-09-11. Every route under `/property` that the rule can match:

| Route | Reads auth? | Safe to cache anon? |
|---|---|---|
| `/property` (hub) | no | yes |
| `/property/[city]` | no | yes |
| `/property/[city]/about`, `/quiz` | no | yes |
| `/property/[city]/results` | no | yes — see note |
| `/property/[city]/landlords/[id]` | no | excluded by `/landlord` substring |
| `/property/[city]/listing/[id]` | **yes** | yes — triple-guarded |
| `/property/[city]/landlord/**` | yes | excluded, and private-headered |

**The listing page is the only auth-varying route in the set**, and it has
three independent guards:

1. The rule's `not http.cookie contains "sb-access-token"` — an authed request
   never matches, so it is never served from cache.
2. `middleware.js` stamps `private, no-cache, no-store, must-revalidate` per
   request when that cookie is present, so even a matched request would not be
   stored.
3. `Vary: Cookie` (set in `next.config.mjs`, not middleware — Next's response
   pipeline tends to replace middleware-set `Vary`) so the CDN keys anon and
   authed separately.

`/claim/[token]` is **not** under `/property` and is additionally pinned to
private headers (#130's other half). It cannot be matched by this rule.

**Note on `/results`.** It is auth-invariant, so caching is safe. The cache
key includes the query string, so filtered searches each become their own
entry and long-tail combinations will mostly `MISS` — that costs nothing, it
just means the win is concentrated on the unfiltered entry that navigation
links to. No reason to exclude it.

## Verification

Run immediately after saving the rule.

```bash
# 1. Anon: second hit must be a HIT.
curl -sI https://studentx.uk/property/thessaloniki/listing/0106002 | grep -iE 'cache-control|cf-cache-status'
curl -sI https://studentx.uk/property/thessaloniki/listing/0106002 | grep -iE 'cache-control|cf-cache-status'
```

```bash
# 2. Authed: must NEVER be a HIT, and must be private. This is the leak check.
curl -sI -H 'Cookie: sb-access-token=verification-stub' https://studentx.uk/property/thessaloniki/listing/0106002 | grep -iE 'cache-control|cf-cache-status'
```

```bash
# 3. Landlord surface: must not be publicly cached.
curl -sI https://studentx.uk/property/thessaloniki/landlord/dashboard | grep -iE 'cache-control|cf-cache-status'
```

```bash
# 4. Claim tokens: must not be cached at any layer.
curl -sI https://studentx.uk/claim/any-token | grep -iE 'cache-control|cf-cache-status'
```

Expected:

| | `cache-control` | `cf-cache-status` |
|---|---|---|
| 1 (anon, 2nd) | `public, s-maxage=300, …` | **`HIT`** |
| 2 (authed) | `private, no-cache, no-store, …` | anything **except** `HIT` |
| 3 (landlord) | `private, no-cache, …` | anything except `HIT` |
| 4 (claim) | `private, no-cache, …` | anything except `HIT` |

Successive requests can land on different PoPs, so a `MISS` on step 1 is worth
one retry before treating it as a failure.

## After it is live

- The `cf-cache-status-hit` canary check stops skipping and starts asserting.
  A long run of `skipped` on it means the rule is not matching — that state is
  what hid #130 for months.
- `cf-cache-authed-not-hit` becomes the session-leak guard. If it ever fires,
  **disable the rule first, diagnose second** — it means signed-in users are
  being served anonymous bodies.
- Watch for 24h before treating the change as settled (#130's acceptance
  criteria).

## Rollback

Set the rule to **Disabled** in the dashboard. No deploy required, effective in
seconds. The site returns to executing the Worker for every request — slower,
and exactly what it did before this change.
