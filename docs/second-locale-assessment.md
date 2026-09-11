# Adding a second locale — what it actually costs

**Status: DECIDED — not doing it. English-only stands (2026-09-11).**

Assessment by Grok, reviewed and spot-checked by Claude. Michael's call after
reading it: too much work for now. The 2-month "revisit multilingual" reminder
was deleted rather than rescheduled — this document replaces it, so a future
"should we add Greek?" starts from measured facts instead of a fresh audit.

Greek was removed in issue #158 / Step B. Nothing here argues for or against
bringing it back; it records what the bill would be.

## What is already easy (and already done)

The routing scaffolding is intact and still cheap:

- The `[locale]` segment is still in the tree; next-intl injects `en`.
- Every `getTranslations` call already passes `{ locale, namespace }` — zero
  violations of the convention CLAUDE.md documents.
- 32 of 33 server `page.js` files call `setRequestLocale` (the one skip is a
  redirect stub).
- The catalog is a single file: **1,629** English strings in
  `src/messages/en.json` (verified 2026-09-11).

That is the part people mean by "next-intl makes i18n easy". It is already
paid for.

## What is not easy — the real bill

A second **live** locale is three separate costs. Only the first is small.

| Layer | Size | Notes |
|---|---|---|
| Routing + switcher | small | Add `'el'`, restore `LocaleSwitcher`, undo the `/el/*` 301s |
| Translate the catalog | **1,629 keys** | Was 731 when Greek was dropped. **+905 since** — gigs, admissions, admin, home, practice, bookings |
| Copy that is **not** in the catalog | **~120–150 UI strings + ~7 email templates** | The expensive hunt. Issue #142 was exactly this class; fixing it on 2026-09-08 did not end the class |

### Hardcoded student-facing leftovers

The ones that actually matter:

- `/resources` hub + facet chrome — never went through next-intl
- Results empty state: "No matches yet." / "Retake the quiz"
- Auth-page eyebrows (`Sign in`, `Sign up`, `Forgot password`) on pages that
  otherwise use `t()`
- Landlord verification page — the entire screen
- `/claim/[token]`
- `BiochemTestPlayer` (the other practice player *is* translated)
- `GigsMap` popup ("Unpaid", "View gig →") even though those keys exist in
  `en.json`
- Guest-profile labels (~50 university / faculty / nationality / language names)
- **All outbound email** — inquiry, both digests, booking, verification, gig
  alert. English HTML, no `preferred_locale` branch
- Several `generateMetadata` descriptions

Admin (`/admin/*`, metrics, ID-verifications) can stay English. AUSoM test
**content** should stay English — it is the school's language. Landlord-written
listing text is not ours to translate.

Since 2026-09-08 specifically: almost no new untranslated *surfaces*. New
product copy (pause, inbox filters, delete-with-bookings, role-conflict) all
went into `en.json` (+18 keys). The bill is pre-existing leftover copy plus a
catalog that has more than doubled since Greek was deleted.

## The design choice that cannot be skipped

English-only today uses `localePrefix: 'never'` and `localeCookie: false`. That
cookie was removed on 2026-09-08 (#130) because `Set-Cookie: NEXT_LOCALE=en`
made Cloudflare skip cache on **every anonymous page**.

A second language has to pick how the choice is stored. There are two real
options:

### A. URL only — the cache-safe one

`localePrefix: 'as-needed'`, default `en`. English stays at `/property/...`
(current canonicals); Greek lives at `/el/property/...`. Delete the `/el/*`
301s, keep the `/en/*` ones. The switcher writes the path, not a cookie.
`localeCookie` stays `false` and the edge cache stays healthy.

**Downside:** `/` is always English. A Greek user landing on the homepage, or
following an unprefixed Google result, sees English until they hit the switcher.

### B. URL + cookie — the "remember me" one

Same prefixes, plus `NEXT_LOCALE`. Returning visitors to `/` get Greek. This is
what StudentX had before, and it is exactly what made anonymous pages
uncacheable. Fixing that means a Cloudflare Cache Rule kept in sync with the
route tree by hand — the approach #130 rejected *after it had already drifted
once*.

There is no third option that is both sticky and cache-safe on this stack.
`Accept-Language` auto-detect is worse: it varies on a header and fights Google.

`preferred_locale` still exists on `students` / `landlords`, but the APIs now
reject `'el'` and no email template reads the column. Re-enabling Greek email
is a separate pass from the UI.

## The compatibility path, if optionality is wanted later

Do **not** add `'el'` yet. Do this, in order, only to make a future "yes" a
translation job instead of an archaeology job:

1. **Sweep leftover UI copy into `en.json`** — mechanical, the #142 class:
   resources, results empty state, auth eyebrows, verification, claim, Biochem
   player, GigsMap. Maybe 1–2 days. Does not change the product.
2. **Commit to URL-prefix architecture (option A)** in CLAUDE.md, so the next
   pass does not re-open the cookie/cache wound.
3. **When Greek is actually added:** deep-merge `el.json` over `en.json` so
   untranslated keys fall back to English. Ship nav + listing + auth first;
   leave admin, emails and practice content for later. next-intl has no
   built-in deep merge — that is a ~20-line helper in `src/i18n/request.js`.

That is incremental. A full bilingual launch is not.

## Documentation drift to fix before any restore

CLAUDE.md's locale story is still mostly true. Three drifts would bite:

- It does **not** mention `localeCookie: false` (#130). That is now the
  important invariant.
- `AuthGate` still takes `locale`, but **nothing imports it**. Listings are
  public; the gate is dead code.
- `src/app/layout.js` still declares
  `alternates.languages = { el: '/', en: '/en' }`.

> **Claude's correction to the original assessment.** That last item was
> described as "a live SEO leftover". It is not live: the homepage renders
> **no** `<link rel="alternate">` at all, because `[locale]/layout.js` sets its
> own `alternates` and overrides the root's. Verified against production on
> 2026-09-11. It is stale dead config worth deleting for tidiness, not an SEO
> problem. Everything else in this document was spot-checked and holds —
> including the 1,629 key count, which is exact.
