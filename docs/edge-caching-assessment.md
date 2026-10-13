# Edge caching: what R2 would buy, and why it is not the lever

Written 2026-09-11, after a page-load investigation that shipped #536 (PDP
serial queries) and #539 (results-page fetch waterfall). Those two fixed the
*cost of a render*. This document is about the separate question of avoiding
the render entirely.

**Conclusion up front: wiring OpenNext's R2 incremental cache would not measurably
speed up any slow page on this site.** That part held up. R2 is a real option
for a different problem we do not currently have.

> ### Correction, 2026-09-12 — the recommendation below was wrong
>
> The original version of this document said the lever was a Cloudflare Cache
> Rule (#130). **It is not.** The rule was applied to prod exactly as specified,
> correctly configured and enabled, and **no HTML response gained a
> `cf-cache-status` header.** See "What applying it actually proved" below.
>
> The negative finding about R2 stands. The positive recommendation did not,
> and it failed for a reason nothing in the repo had recorded: the Worker is
> attached as a **custom domain**, so there is no origin fetch for the CDN to
> cache.
>
> The substantive correction is that **the win we were chasing already exists.**
> `/`, `/gigs`, `/resources` and `/property` are already served from OpenNext's
> own cache at 81-104ms without running a render. The original measurements
> treated an absent `cf-cache-status` as proof that nothing was cached, and
> never checked `x-opennext-cache`. That single wrong header turned "already
> solved for the cacheable pages" into "nothing is cached anywhere", and every
> recommendation downstream inherited the error.
>
> Sections below are left as written, with the disproven ones marked.

> ### Addendum, 2026-10-13 — `stale-while-revalidate` removed
>
> The public header is now `public, s-maxage=300`. The SWR directive had no
> reader at the CDN (this document's finding). Browsers did read it, and they
> used it to serve the previous build's RSC payloads after a deploy. See
> "Deploy skew" at the end. Header values quoted in the measurements below
> are as they were then.

## Two caches, routinely confused

They sit at different layers and fix different things. Conflating them is
what put "wire R2" at the top of a performance list where it does not belong.

| | OpenNext incremental cache | Cloudflare CDN edge cache |
|---|---|---|
| What it stores | Rendered output of **prerenderable** routes (SSG/ISR) | Any HTTP response, keyed by URL + `Vary` |
| Who reads it | The Worker, during a render | The edge, **before** the Worker runs |
| Configured in | `open-next.config.ts` | Cloudflare dashboard → Cache Rules |
| Currently | `staticAssetsIncrementalCache`, read-only | **Not firing** — see below |
| Observable as | `x-opennext-cache: HIT` | `cf-cache-status: HIT` |
| R2 would change | this one | not this one |

A hit in the second one means the Worker never executes. That is the only
mechanism on this list that turns a ~230ms render into a ~40ms static serve.

## Current state, measured

Prod, 2026-09-11, after #536 and #539 deployed. Ten warm samples each:

```
/property/thessaloniki/results          median 237ms
/property/thessaloniki/listing/0106002  median 227ms
```

Headers:

```
$ curl -sI https://studentx.uk/property/thessaloniki/listing/0106002
cache-control: public, s-maxage=300, stale-while-revalidate=86400
vary: Cookie
                        ← no cf-cache-status, no x-opennext-cache

$ curl -sI https://studentx.uk/gigs
cache-control: public, s-maxage=300, stale-while-revalidate=86400
x-opennext-cache: HIT   ← incremental cache working as designed
```

So: the incremental cache is doing its job on prerendered routes, and the CDN
is caching no HTML at all.

## What R2 would actually buy

`staticAssetsIncrementalCache` is **read-only**: prerendered pages are baked
into the Worker's assets at build time. Swapping in `r2IncrementalCache` (plus
a DO queue and a tag cache) makes the store **writable**, which buys exactly
one capability: **runtime revalidation — ISR**. Pages could regenerate between
deploys instead of only at deploy.

The question is therefore narrow: *which routes want to be prerendered AND
change between deploys?*

- **Practice tests, flashcards, marketing, About, quiz** — prerenderable, but
  they change only when we deploy. The read-only cache is already the correct
  fit, not a compromise. The header comment in `open-next.config.ts` says as
  much, and it is right.
- **`/property/[city]/results`** — dynamic because it reads `searchParams`.
  Every filter combination is a distinct render. Not prerenderable, so ISR
  does not apply.
- **`/property/[city]/listing/[id]`** — dynamic because the server render
  reads the auth cookie (`requireStudent`) to decide whether to gate contact
  info. Not prerenderable **as currently written**. See the option below.
- **Everything under `/student/*`, `/property/[city]/landlord/*`, `/claim/*`**
  — per-session by definition. Never cacheable at any layer.

That leaves no route that both wants prerendering and changes at runtime. **R2
would be correctly configured infrastructure serving zero traffic.**

Worth stating plainly because CLAUDE.md currently implies otherwise: its
OpenNext quirk 3 says "the locale page tree is force-dynamic — do not re-add
prerendering/ISR" and that re-enabling needs R2 first. **That is stale.**
#316's blanket `force-dynamic` is gone; `[locale]/layout.js` has
`generateStaticParams`, and prerendering is live and safe today because the
static-assets cache + `enableCacheInterception` removed the shared-render-stream
path that caused the 1101s. Only four files in the `[locale]` tree still set
`force-dynamic`, all admin/claim. This document corrects that entry.

## ⛔ DISPROVEN — "The actual lever: the Cloudflare Cache Rule (#130)"

*Kept as written for the record. Everything in this section about how Cache
Rules are evaluated is accurate; the conclusion that one would cache this
app's HTML is not. See the correction at the top and the measurements below.*

Worker responses on a custom domain bypass Cloudflare's CDN cache. A
`Cache-Control` header alone changes nothing — this was verified the hard way
in #261, where marking the login shells `public, s-maxage=300` produced
identical TTFB and no `cf-cache-status`, and was reverted. The mechanism is a
**Cache Rule**, not a header.

A rule already exists (from #105/#126) but matches the wrong paths:

```
matches:  /property/listing/*
reality:  /property/thessaloniki/listing/*
```

Cloudflare evaluates the rule on the request URL **before** middleware
redirects, so the existing rule caches the 301 and never the page. Confirmed:

```
$ curl -sI https://studentx.uk/property/listing/0106002
HTTP/2 301                    ← no cf-cache-status even here
location: /property/thessaloniki/listing/0106002
```

**The expression to use lives in `docs/runbooks/cloudflare-cache-rule.md`, not
in issue #130's body.** The issue body predates that runbook and has three
defects: it hardcodes `thessaloniki` in the landlord exclusion (while
`SUPPORTED_CITIES` now holds seven slugs), it cites next-intl's
`Set-Cookie: NEXT_LOCALE` as a blocker (gone — #511 removed `localeCookie`,
and prod now returns zero `Set-Cookie` on `/property/thessaloniki`), and its
`/en/*` clauses are dead (#158 301s those to unprefixed). The runbook's
version is city-agnostic, covers `/`, `/about`, `/admissions`, `/gigs` and
`/resources` alongside `/property`, and pins the Edge TTL setting that makes
the whole thing safe. #130's body should be updated when it is picked up.

So #130 is closer to done than its body suggests — but read the runbook, not
the issue.

**Safety already in place.** The pieces that make this safe were built
deliberately and are load-bearing:

- `Vary: Cookie` on listing detail (`next.config.mjs`), so an anonymous cached
  body can never be served to a signed-in visitor.
- `middleware.js` sets `Cache-Control` per request from the `sb-access-token`
  cookie — public for anon, private for authed.
- `/claim/*` pinned private (#130's other half) so a token-scoped page cannot
  land in a shared cache.
- The rule expression itself excludes `sb-access-token` holders.

The risk to respect is that a Cache Rule turns any *latent* header
misconfiguration into a live one — which is exactly what #130's own body warns
about for `/claim`. Anything newly matched must be audited for auth-varying
content before the rule widens.

## Options, ranked

### 1. ⛔ Fix the Cache Rule expression (#130) — DISPROVEN, do not do this

Dashboard change, no deploy. Anonymous hits on `/property/*` (hub, city
landing, results, listing detail, about, quiz) start being served from the edge
without executing the Worker.

- **Payoff:** ~230ms → ~40ms on repeat anonymous hits; Worker invocations and
  Supabase reads drop by whatever share of traffic is anonymous and repeated,
  which for an SEO-acquisition site is most of it.
- **Effort:** ~1h including verification.
- **Risk:** Medium, and concentrated in the expression. Every path newly
  matched must be confirmed auth-invariant or `Vary`-protected.
- **Verification:** `cf-cache-status: HIT` on a second anonymous request;
  `MISS`/`BYPASS` with an `sb-access-token` cookie present; `/claim/<token>`
  never cached. The synthetic canary should grow a check — see
  `docs/runbooks/synthetic-en-listing.md`, which already documents this gap
  under "Known limitations".

### 2. Make the PDP prerenderable — the only route where R2 becomes interesting

The listing page is the SEO surface and is identical for every anonymous
visitor. It is dynamic solely because the server render reads the auth cookie
to gate contact info. Moving that gate to the client (or into a separate
dynamic segment) would make the page prerenderable — and *then* ISR matters,
because listings change at runtime when landlords edit them. **This is the one
scenario that justifies R2**, and note the ordering: the architectural change
comes first, R2 second.

- **Payoff:** Large in principle. Largely overlaps option 1 for anonymous
  traffic, which is why it is second, not first.
- **Effort:** 1-2 days. Touches the auth gate on the highest-value page, plus
  R2 bucket, DO queue, tag cache, and `open-next.config.ts`.
- **Risk:** High. The gated-contact-info boundary is a correctness and
  business-model surface, not a perf detail. Getting it wrong leaks contact
  details to anonymous visitors.
- **Do not start this before option 1 is measured** — option 1 may capture
  most of the available win for a fraction of the risk.

### 3. Wire R2 on its own — not recommended

Correct infrastructure, no traffic. Adds an R2 bucket, a DO queue, a tag
cache, and moving parts to `open-next.config.ts`, in exchange for a capability
(runtime revalidation) that nothing currently requests. Revisit only if option
2 happens, or if content appears that must regenerate between deploys.

## What applying it actually proved (2026-09-12)

The rule was applied to prod via `scripts/cf-cache-rule.sh --apply`. Two
surprises before the measurements even started:

1. **The deployed expression was already correct.** Not the stale
   `/property/listing/*` that #130 describes — the full GET / `sb-access-token`
   / `/landlord` / `/student` / `/admin` / `/claim` / `/api/` version with the
   allowlist. Someone had already fixed it.
2. **The real misconfiguration was `edge_ttl: {"mode": "bypass_by_default"}`**,
   which bypasses cache regardless of what the expression matched. So the only
   change made was `bypass_by_default` → `respect_origin`.

That change is correct. It changed nothing:

| path | `x-opennext-cache` | `cf-cache-status` | median TTFB |
|---|---|---|---|
| `/` | **HIT** | none | 104ms |
| `/gigs` | **HIT** | none | 81ms |
| `/resources` | **HIT** | none | 82ms |
| `/property` | **HIT** | none | 89ms |
| `/property/thessaloniki` | none | none | 71ms |
| `/property/thessaloniki/results` | none | none | 209ms |
| `/property/thessaloniki/listing/0106002` | none | none | 222ms |
| `/_next/static/chunks/*.js` | — | **HIT** | — |

### Reading that table

**No HTML response carries `cf-cache-status`, with a correct and enabled rule.**
Static assets do. So the zone's cache works — this is not a rule-syntax problem
and no further expression tuning will fix it.

The explanation that fits every row is the attachment model. `wrangler.jsonc`:

```json
{ "pattern": "studentx.uk", "custom_domain": true }
```

On a Workers **custom domain** the Worker is the terminus. Cache Rules
configure how Cloudflare caches responses *from an origin*, and there is no
origin fetch here to cache. Static assets are the exception because Workers
Static Assets caches those itself, which is exactly why they are the only rows
with `cf-cache-status`.

That mechanism is inference from the measurements, not something Cloudflare
told us — but it is the only explanation consistent with "zone caches assets,
never HTML, regardless of rule". The decisive test would be moving off
`custom_domain`, which is not worth doing for this.

**And the win was already there.** Four surfaces serve from OpenNext's cache at
81-104ms without running a render. The 2026-09-11 measurements missed this by
treating an absent `cf-cache-status` as proof of no caching, without checking
`x-opennext-cache`.

### What is genuinely left

Only two pages run a real render, and neither is a caching-config problem:

- `/property/thessaloniki/results` — 209ms, dynamic on `searchParams`
- `/property/thessaloniki/listing/0106002` — 222ms, dynamic on the auth cookie

Both are already inside normal latency. Making either cacheable means the
architectural change in option 2 — and *that* is the only path on which R2
ever becomes relevant.

*(A one-off 723ms median on `/results` was recorded mid-investigation and did
not reproduce: an interleaved A/B of 12 pairs put plain and cache-busted
requests at 209ms vs 210ms. Occasional multi-second outliers on any dynamic
page are cold isolates.)*

## Two canary checks are now permanently inconclusive

`cf-cache-status-hit` and `cf-cache-authed-not-hit` both skip when no
`cf-cache-status` header is present, which is now known to be the permanent
state for HTML. **They will skip forever, and that is correct behaviour, not a
fault.** Do not "fix" them into failing — a skip is the honest report for a
check whose precondition cannot be met.

They stay because they cost nothing and would become meaningful the moment the
attachment model changes. `docs/runbooks/synthetic-en-listing.md` records the
same note.

## Recommendation

**Do nothing further on edge caching.** The cacheable pages are cached and fast
(81-104ms); the uncacheable ones are dynamic by construction and already at
~210ms. There is no configuration change left that would help.

If page load becomes a priority again, the next real lever is option 2 — moving
the PDP's auth gate off the server render so the page becomes prerenderable —
and R2 follows from that decision rather than preceding it. Weigh it against the
risk noted there: the gated-contact-info boundary is a business-model surface,
not a perf detail.

## Open question for a human

Whether `/property/thessaloniki/results` at ~210ms is worth any further work at
all. It is four parallel Supabase queries behind a dynamic render. The obvious
next step would be caching common filter combinations, but the unfiltered entry
is already the fast path and the long tail is genuinely per-user. Probably
leave it.

## Deploy skew (2026-10-13)

**Symptom.** Minutes after #614 deployed, the first load of `/boarding` logged
`Refused to apply style from '/_next/static/chunks/264gaaaleuaem.css' … MIME
type ('text/html')`. That chunk 404s, and no page or `?_rsc=` payload on prod
referenced it.

**The hypothesis was a stale edge copy. That is refuted.** HTML and RSC
responses carry no `cf-cache-status` and no `age`. That is the custom-domain
finding above, re-checked on the day. The stale copy was in the **browser's**
HTTP cache.

**What happened, each step verified:**

1. **Every deploy deletes the previous build's chunks.** Workers assets keep no
   old versions. Turbopack chunk names are deterministic, so building each
   merge locally maps them: `264gaaaleuaem.css` is #613's CSS,
   `0nhnrikx6aia-.css` is #614's, and `2j0llkgtygka4.css` is #615's. #614 was
   live for about 2.5 minutes (12:17 to 12:19:41 UTC) before #615 replaced it,
   and by then #614's CSS 404'd as well. A missing chunk falls through to the
   Worker, which returns the Next 404 page as `text/html`. Hence the MIME
   error.
2. **The `?_rsc=` payloads carried `public, s-maxage=300,
   stale-while-revalidate=86400`**, the same rule as the HTML. A browser
   ignores `s-maxage`, and with no `max-age` or `Last-Modified` the freshness
   lifetime is 0. SWR then lets it serve the stale copy for up to a day.
3. **Chromium honours SWR on `fetch()`, which is how the router requests RSC.**
   It does not honour it on navigations. A local harness sent these exact
   headers with a body that changed on every request. A repeat `fetch()` got
   the OLD body from cache (`transferSize 0`), with only a background
   `If-None-Match` reaching the server. A repeat navigation was revalidated
   synchronously. So the HTML document is always current. Only the router's
   prefetches and navigations can be stale.
4. **Next decodes a payload before it checks the build ID.** In
   `fetch-server-response.js` and `segment-cache/cache.js`, React Flight
   dispatches the payload's `:HL[...css, "style"]` hint during decoding. Only
   afterwards does the client compare the payload's build ID with its own,
   then discard the prefetch or fall back to a full page load. The page stays
   correct. The old CSS gets requested anyway.

**Reproduced end to end** under `opennextjs-cloudflare preview`. The steps:
serve #613's build, browse `/`, swap in #614's build on the same origin, and
prefetch from a fresh page. The prefetches for `/` and `/results` came back
from the browser cache (`transferSize 0`, #613's payloads). A
`<link rel="preload" href="…/264gaaaleuaem.css">` was injected into the #614
page, while the page itself used #614's stylesheet.

**User-visible cost before the fix:** console noise, plus one wasted request
per stale entry. A navigation onto a stale entry becomes a full page load
instead of a soft one. Results pages, being dynamic, could also show data up
to a day old for one navigation. No unstyled pages: the document itself is
never stale.

### Fix

- **`public, s-maxage=300` with no SWR** (`next.config.mjs`, and
  `src/middleware.js` for anon listing pages). Nothing is lost:
  - The CDN never read the directive.
  - Browsers sent the same revalidation request either way (SWR only moves
    it to the background).
  - Prod does not answer `If-None-Match` with 304 on these routes, so SWR
    saved no bytes either.
- **`/_next/static/*` → `public, max-age=31536000, immutable`** (`public/_headers`;
  OpenNext's documented setting). Workers assets otherwise serve
  `max-age=0, must-revalidate`, so a browser revalidated every chunk on every
  page load. In local preview a second page load made 15 conditional requests
  to `/_next/static`. With immutable, 18 of 22 chunks came straight from
  cache. Every
  deploy deletes the old chunks, so a revalidation of a chunk the visitor
  already held would 404. Immutable lets them use their copy.
  - Safe because the names are content addresses. Between the #614 and #615
    builds, all 90 shared filenames were byte-identical.
  - A missing chunk's 404 comes from the Worker, which keeps `no-store`, so a
    404 is never cached.

Verified with the same reproduction. After a deploy of a CSS-only change, the
same `_rsc` URLs that had been served stale all went to the network, and no
preload of the previous build's CSS appeared.

**One-time transition.** Entries a browser cached before this deploy still
carry the old SWR directive. The first load after the fix deploys can show the
error once per entry. Their background revalidation replaces them.

### What this does not cover, and why not more

A tab left open across a deploy can still request a chunk it never loaded, for
example a lazily imported component, and that chunk is gone. Next's build-ID
check handles route navigations with a full page load. It does not handle
lazy chunks or Server Actions (`admin/practice-reports` is the only one).
Closing that gap means keeping old assets reachable:

- **OpenNext's skew protection** (`cloudflare.skewProtection`) routes
  old-deployment requests to each old version's preview URL on workers.dev.
  It does not fit here:
  - Preview URLs live on workers.dev, which #515 turned off for good reasons.
  - It needs `run_worker_first`, which bills every asset request as a Worker
    request.
  - It needs a Workers Scripts API token in the build environment.
  - It is marked experimental.
- **Carrying the previous build's `_next/static` into each new deploy.** A
  build step would fetch them and copy them in. It works, but it adds a
  network dependency to every build and a manifest to maintain.

At the current scale (a single-digit number of concurrent visitors, several
deploys a day), neither is worth it. Revisit if `ChunkLoadError`s show up in
Workers Logs.

**If the CDN ever does cache HTML** (the attachment model changes), do NOT
re-add SWR to these routes. A stale edge copy of the HTML document would be the
original hypothesis made real: the first visitor after a deploy gets the old
document, and its CSS 404s. Pair any edge caching of HTML with a purge on
deploy.

