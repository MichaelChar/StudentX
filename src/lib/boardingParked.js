import { DEFAULT_CITY } from './cityRoutes.js';

/*
  /boarding (SWISS BOARDING SCHOOLS) — PARKED, NOT DELETED.
  ─────────────────────────────────────────────────────────

  Founder's call, 2026-11-08: take the boarding product (the school-recruitment
  lead form, its partner/embed pages and its link in the nav) off the public
  site. NOTHING IS DELETED. The page tree, components, lead API, copy, the
  `boarding_leads` table (migration 128) and every lead already in it stay
  exactly as built; a parked product is one the public can't reach.

  What obeys BOARDING_ENABLED (search for the name to find them all):

    src/middleware.js              /boarding and /boarding/* 307 to the housing
                                   landing; `/` 307s there too, because the
                                   two-product homepage is half boarding.
    src/app/sitemap.js             drops /boarding, and `/` (it redirects).
    src/app/api/boarding/lead      410 before touching the database or email.
    src/components/home/HousingHome.js   drops the Boarding tile.
    src/components/AccountMenu.js        drops the Boarding menu row.
    scripts/verify-deploy.mjs      asserts the redirect instead of a 200.

  One thing the flag can NOT reach: public/boarding/embed.js. Static files are
  served straight from the assets binding, before the Worker or middleware
  runs, so it cannot read this constant. It is therefore a no-op stub while
  parked (partners paste its URL on their own sites, so it must stay a valid
  script rather than 404), and __tests__/config/boardingParked.test.js fails if
  the flag and the file disagree.

  The other public/boarding/* files (the PDF, og.jpg, the photos) are inert and
  stay where they are, so they remain fetchable by direct URL. Unlinked, but not
  hidden — move them out of public/ if that ever matters.

  TO BRING IT BACK:
    1. set BOARDING_ENABLED to true below
    2. restore public/boarding/embed.js from git history (the commit before the
       one that stubbed it: `git log --follow public/boarding/embed.js`)
    3. put the `/` page back in play — flipping the flag does it, since
       PARKED_HOME_TARGET becomes null and the middleware stops redirecting
    4. re-run the `/boarding` smoke check by hand (`node scripts/verify-deploy.mjs`)

  Explicit `.js` extension on the import above is deliberate: scripts/
  verify-deploy.mjs imports this file under plain Node, which (unlike the
  bundler) does not resolve extensionless specifiers.
*/
export const BOARDING_ENABLED = false;

/** Where the parked product's URLs (and `/`) are sent, else null. */
export const PARKED_HOME_TARGET = BOARDING_ENABLED ? null : `/property/${DEFAULT_CITY}`;

/** True for /boarding and anything under it. */
export function isBoardingPath(pathname) {
  return pathname === '/boarding' || pathname.startsWith('/boarding/');
}
