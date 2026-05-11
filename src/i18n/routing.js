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
});
