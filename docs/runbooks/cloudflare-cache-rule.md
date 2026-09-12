> ## ⛔ SUPERSEDED — the premise in this runbook is disproven
>
> **A Cloudflare Cache Rule cannot cache this app's HTML.** The rule below was
> applied to prod on 2026-09-12 exactly as written, correctly configured and
> enabled, and **no HTML response gained a `cf-cache-status` header.** The
> procedure is kept because it is accurate *as a procedure* — and because
> knowing it does not work is worth more than a deleted file.
>
> **Read `docs/edge-caching-assessment.md` first.** The short version:
>
> - The Worker is attached as a **custom domain** (`wrangler.jsonc`:
>   `{"pattern": "studentx.uk", "custom_domain": true}`). The Worker *is* the
>   terminus, so there is no origin response for the CDN to store. Cache Rules
>   configure how Cloudflare caches origin fetches; there isn't one.
> - This is not a zone problem: static assets under `/_next/static/` **do**
>   return `cf-cache-status: HIT`, because Workers Static Assets caches those
>   itself.
> - **The win already exists elsewhere.** `/`, `/gigs`, `/resources` and
>   `/property` serve from OpenNext's own cache (`x-opennext-cache: HIT`) at
>   81-104ms TTFB. It was there all along under a different header — reading
>   `cf-cache-status` as the only proof of caching is what hid it.
> - The pages a rule could never have helped anyway — `/results` (reads
>   `searchParams`) and `/listing/[id]` (reads the auth cookie) — are dynamic
>   by construction. They need the architectural change in the assessment, not
>   a caching config.
>
> **The applied rule is harmless and has been left in place.** Authed requests
> still return `private, no-cache, no-store` with no cache status, verified
> after the change. `respect_origin` is the more correct setting should the
> attachment model ever change.
>
> Do not spend more time on Cache Rules for HTML without first disproving the
> custom-domain explanation above.

# Runbook — Cloudflare Cache Rule for anonymous pages

**Issue:** [#130](https://github.com/MichaelChar/StudentX/issues/130) · **Related:** [#131](https://github.com/MichaelChar/StudentX/issues/131), [#67](https://github.com/MichaelChar/StudentX/issues/67) (closed)

> **This is a dashboard change.** It cannot be committed. The repo half —
> correct `Cache-Control` per route, `Vary: Cookie`, and a canary that
> notices when caching stops working — is done; this is the switch that
> makes it take effect.

## Why a rule is needed at all

**Cloudflare does not cache HTML by default, whatever `Cache-Control` says.**
Only a Cache Rule marking a path eligible will do it. That is why every
public page correctly advertises `public, s-maxage=300,
stale-while-revalidate=86400` and yet, measured on prod 2026-09-10:

```
$ curl -sI https://studentx.uk/property/thessaloniki | grep cf-cache-status
(nothing — on repeated requests)
```

No `cf-cache-status` header at all means the response never entered the
cache. Every anonymous page render is currently hitting the Worker.

Note this is **not** the same as the `Set-Cookie` problem fixed in #511 —
that was a second blocker sitting behind this one. Both had to go.

## What the origin already does (verified prod, 2026-09-10)

| path | `Cache-Control` |
|---|---|
| `/`, `/about`, `/admissions`, `/gigs`, `/resources` | `public, s-maxage=300, …` |
| `/property`, `/property/:city`, `/about`, `/quiz`, `/results` | `public, s-maxage=300, …` |
| `/property/:city/listing/:id` | `public…` anon · `private, no-store` with `sb-access-token` |
| `/property/:city/landlord/**`, `/property/:city/landlords/:id` | `private, no-cache, no-store` |
| `/student/**`, `/admin` | `private, no-cache, no-store` |
| `/claim/:token` | `private, no-store` **(fixed in this PR — was public)** |

**This matters for how the rule is written.** The origin is already the
authority on what may be cached, so the rule should defer to it rather
than re-encode the route tree — which is exactly how the current rule
drifted (it matches `/property/listing/*`, a path that has not existed
since listings moved to `/property/:city/listing/:id`, so it has been
caching a 301 rather than a page).

## Two ways to apply it

**Script (preferred).** `scripts/cf-cache-rule.sh` applies exactly the
expression and settings below via the Cloudflare API. Dry-run by default —
it prints the current rule and the proposed one and changes nothing until
`--apply`. Prefer it over the dashboard: the expression is what protects
`/student`, `/admin`, `/claim` and every landlord surface, and retyping it by
hand makes a typo a session leak rather than a broken build.

```bash
export CF_API_TOKEN=...             # Zone→Cache Rules→Edit + Zone→Zone→Read, studentx.uk only
./scripts/cf-cache-rule.sh          # show current vs proposed
./scripts/cf-cache-rule.sh --apply  # write it
./scripts/cf-cache-rule.sh --disable  # rollback
```

Note `wrangler` cannot do this — it has no cache-rules command, and its OAuth
token carries `zone:read` but no rulesets write scope. A purpose-scoped API
token is required either way.

**Dashboard.** The equivalent by hand, and the reference for what the script
writes.

Cloudflare dashboard → **Caching → Cache Rules** → edit the existing
*"Cache anon listing detail (Set-Cookie override)"* rule.

### 1. Expression

```
http.request.method eq "GET"
and not http.cookie contains "sb-access-token"
and not http.request.uri.path contains "/landlord"
and not starts_with(http.request.uri.path, "/student")
and not starts_with(http.request.uri.path, "/admin")
and not starts_with(http.request.uri.path, "/claim")
and not starts_with(http.request.uri.path, "/api/")
and (
  http.request.uri.path eq "/"
  or starts_with(http.request.uri.path, "/about")
  or starts_with(http.request.uri.path, "/admissions")
  or starts_with(http.request.uri.path, "/gigs")
  or starts_with(http.request.uri.path, "/resources")
  or starts_with(http.request.uri.path, "/property")
)
```

Notes on the shape:

- `contains "/landlord"` rather than a city-specific prefix, so it keeps
  working when a second city goes live. It also covers
  `/property/:city/landlords/:id` (the public landlord profile), which the
  origin marks private.
- No `/en/*` or `/el/*` branches. Those 301 to unprefixed paths (#158), and
  caching a redirect is what the current rule accidentally does.
- The exclusions are **belt-and-braces**, not the safety mechanism. The
  origin's own `Cache-Control` is, via the next setting.

### 2. Settings — the one that actually matters

| setting | value |
|---|---|
| Cache eligibility | **Eligible for cache** |
| Edge TTL | **Use cache-control header if present** |
| Browser TTL | Respect origin |

**Do not set a fixed Edge TTL.** "Use cache-control header if present" is
what makes a `private, no-store` response stay uncached even when its path
matched the expression. With a fixed TTL, a rule-matching path would be
cached regardless of what the origin said — which turns every exclusion
above into the only thing standing between a private page and a shared
cache, and one typo into a session leak.

## Verify

**1. Anonymous pages start reporting cache status.** Repeat each twice —
the first request warms it.

```bash
for p in / /property /property/thessaloniki /property/thessaloniki/results; do
  curl -sI "https://studentx.uk$p" -o /dev/null -w "%{url_effective} "
  curl -sI "https://studentx.uk$p" | grep -i cf-cache-status
done
```

Expect `cf-cache-status: HIT` on the second fetch (`MISS` then `HIT` is
normal; `DYNAMIC` means the rule did not match).

**2. Authenticated requests are still not cached.**

```bash
curl -sI -H "Cookie: sb-access-token=stub" \
  https://studentx.uk/property/thessaloniki/listing/0106002 \
  | grep -iE "cf-cache-status|cache-control"
```

Expect `private, no-cache, no-store` and **not** `HIT`.

**3. Private surfaces stay out.**

```bash
for p in /student/login /property/thessaloniki/landlord/login /claim/test123; do
  printf "%s " "$p"
  curl -sI "https://studentx.uk$p" | grep -i cf-cache-status || echo "(no cache status — correct)"
done
```

## The canary picks it up automatically

`/api/cron/synthetic-en-listing` already has a **`cf-cache-status-hit`**
check, added for #130/#131. It warms the edge with a global `fetch` (not
the service binding, which bypasses the CDN) and asserts a repeat fetch
reports `HIT`.

**Today it silently skips**, because it treats an absent
`cf-cache-status` header as "not behind a CDN" rather than a failure —
which is precisely the state prod is in. Once this rule is live the header
appears and the check goes live with it, so a future rule regression
alerts within 15 minutes instead of going unnoticed the way the current
drift did.

That transition is the tell: **if the canary is still reporting
`cf-cache-status-hit` as skipped an hour after you save the rule, the rule
is not matching.**

### The other half: `cf-cache-authed-not-hit`

`cf-cache-status-hit` proves the anon body **is** cached. It says nothing
about who else can be served it, and that is the failure with consequences.

If this rule is ever widened, reordered, or loses its `not http.cookie
contains "sb-access-token"` clause, Cloudflare starts answering authed
requests from the anon entry. The origin is never consulted — so
`en-listing-authed-cache` and `en-listing-vary-cookie`, which can only see
origin responses, both keep passing while a signed-in student is handed the
anonymous, contact-info-gated body (#67).

`cf-cache-authed-not-hit` warms the edge **anonymously**, then fetches the
same URL carrying the synthetic auth cookie and fails if the response reports
`cf-cache-status: HIT`. It skips on the same inconclusive conditions as its
sibling, so like `cf-cache-status-hit` it only becomes meaningful once this
rule is live.

**If it ever fires, disable the rule first and diagnose second.** It does not
mean caching is misconfigured; it means sessions are leaking.
