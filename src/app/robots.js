const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

/*
  Google resolves a conflict between rules by taking the LONGEST matching
  pattern, with Allow winning a tie. So each `allow` entry below is a hole
  punched in a broader `disallow`, and only for exactly the URLs it spells out.
  In robots.txt `*` is a wildcard, `$` anchors the end of the URL, and `?` is a
  literal question mark. `__tests__/app/robots.test.js` checks the result with
  those semantics.

  WHAT STAYS BLOCKED, ON PURPOSE
    /api/                    Everything not allowed below: session, account and
                             write endpoints, cron, webhooks.
    /property/{city}/landlord/
                             The signed-in landlord dashboard.
  These show up in Search Console as "Blocked by robots.txt", which is the
  intended result. Don't "fix" them by removing the rule.

  THE HOLES, AND WHY EACH ONE EXISTS
  1. Public read endpoints that pages fetch() WHILE RENDERING. Googlebot's
     renderer obeys robots.txt for fetch() as well, so a blocked endpoint
     renders as an empty section. That hid the housing landing's listing row
     (HomeListings → /api/listings?page=1) and the entire gigs board
     (gigs/results → /api/gigs, /countries, /prices) from Google. Search
     Console flagged it on 2026-11-09. The `$` and `?` forms admit the
     collection URL with or without a query and nothing under it, so
     /api/listings/{id}/view (a POST from ViewTracker) stays blocked and
     Googlebot's renders don't count as views. The JSON itself is never
     indexed: next.config.mjs sends `X-Robots-Tag: noindex` on /api/*.
     Before adding an endpoint here, check it is a GET returning only public
     data.
  2. The old per-role login and signup URLs. They 301 to /login and /signup
     (next.config.mjs), but Google can only follow a redirect it may fetch. While
     blocked, the old URLs stayed in its records as "Blocked by robots.txt"
     instead of passing to the new pages. Same `$` / `?` pair, so nothing
     else under /landlord/ opens up.
*/
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/api/listings$',
          '/api/listings?',
          '/api/gigs$',
          '/api/gigs?',
          '/api/gigs/countries',
          '/api/gigs/prices',
          '/property/*/landlord/login$',
          '/property/*/landlord/login?',
          '/property/*/landlord/signup$',
          '/property/*/landlord/signup?',
        ],
        disallow: ['/api/', '/property/*/landlord/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
