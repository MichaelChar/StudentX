# Edge caching: what R2 would buy, and why it is not the lever

Written 2026-09-11, after a page-load investigation that shipped #536 (PDP
serial queries) and #539 (results-page fetch waterfall). Those two fixed the
*cost of a render*. This document is about the separate question of avoiding
the render entirely.

**Conclusion up front: wiring OpenNext's R2 incremental cache would not measurably
speed up any slow page on this site.** The lever is a Cloudflare Cache Rule —
already tracked as issue #130, already partly written, and dashboard config
rather than code. R2 is a real option for a different problem we do not
currently have.

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

## The actual lever: the Cloudflare Cache Rule (#130)

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

Issue #130 already contains the corrected expression. One of the two blockers
it lists is **no longer real**: it cites next-intl's `Set-Cookie: NEXT_LOCALE`
as defeating the cache, and #511 removed `localeCookie` for precisely this
reason. Prod now returns zero `Set-Cookie` headers on `/property/thessaloniki`.
So #130 is closer to done than its body suggests, and its body should be
updated when it is picked up.

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

### 1. Fix the Cache Rule expression (#130) — recommended

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

## Recommendation

Do #130. Measure. Only then decide whether the PDP rework in option 2 is worth
its risk — and let that decision, not this one, be what pulls R2 in.

## Open question for a human

Whether the Cache Rule should cover `/property/[city]/results`. The rule keys
on full URL including query string, so a filtered search is a distinct entry
and long-tail combinations would mostly miss. The hub, city landing and listing
detail are the high-value entries; results may be better excluded to keep the
cache from filling with single-use keys. Worth deciding deliberately rather
than inheriting from a `starts_with(/property)` prefix.
