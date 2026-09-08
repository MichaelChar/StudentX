import { defineRouting } from 'next-intl/routing';

// Single-locale config (Greek removed 2026-05-11, issue #158, Step B).
// `localePrefix: 'never'` keeps every URL unprefixed — both /property/foo
// and /en/property/foo would be served by Next-intl, but with no Greek
// alternate to disambiguate. Legacy /en/* and /el/* paths are 301'd to
// the unprefixed form in next.config.mjs to keep Google's link equity
// flowing during the index refresh.
export const routing = defineRouting({
  locales: ['en'],
  defaultLocale: 'en',
  localePrefix: 'never',

  /*
    No NEXT_LOCALE cookie (issue #130).

    next-intl sets `Set-Cookie: NEXT_LOCALE=en` on every response so a
    returning visitor keeps their chosen language. With ONE locale that
    cookie can only ever hold 'en': it carries no information, nothing in
    this repo reads it, and there is no language picker left to feed it
    (the LocaleSwitcher went with Greek in #158).

    It was not merely useless, it was expensive. Cloudflare bypasses its
    cache by default for any response carrying Set-Cookie, so this cookie
    made every anonymous /property/* page uncacheable at the edge —
    despite next.config.mjs correctly serving
    `public, s-maxage=300, stale-while-revalidate=86400` on all of them.

    #130 proposed working around that with a Cloudflare Cache Rule whose
    expression enumerates cacheable path prefixes and their exclusions.
    That rule has to be kept in sync with the route tree by hand, in a
    dashboard, with no test — and it had already drifted once (it matches
    /property/listing/*, but listings actually live at
    /property/thessaloniki/listing/*, so it was caching the 301 rather
    than the page).

    Removing the cookie fixes the cause instead of compensating for it,
    in the file that owns the behaviour.

    If a second locale ever returns, this line comes out — see the
    scheduled 2026-11-08 review in [[studentx-revisit-multilingual]].
  */
  localeCookie: false,
});
