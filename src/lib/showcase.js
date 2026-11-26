import { PARKED_HOME_TARGET, isBoardingPath } from './boardingParked.js';

/*
  THE STUDENTX SHOWCASE — AND THE PLATFORM IT PARKS.
  ──────────────────────────────────────────────────

  Founder's call, 2026-11-22: studentx.uk becomes a corporate showcase (StudentX
  the parent, MG² the property venture, properties named 101, 102, 103…). The
  rule is "anything not in the new menus is hidden". So once SHOWCASE_LIVE is
  true, the whole housing / accounts platform is PARKED, NOT DELETED: every
  page, component, API route, cron job and database row stays exactly as built.
  A parked page is one the public can't reach.

  The new menus (and so the only public pages once live):
    /  /about-us  /press  /ventures  /mg2  /map  /featured-properties
    /featured-properties/<number>

  What obeys SHOWCASE_LIVE (search for the name, or PLATFORM_EMAILS_PARKED, to
  find them all):

    src/middleware.js          parkedRedirectTarget() below, before anything
                               else: parked paths 307 to `/`, and boarding's own
                               `/` redirect stands down so `/` can be the
                               showcase.
    src/app/sitemap.js         drops the parked routes.
    user-facing email senders  return early, so no email links into a parked
                               page (PLATFORM_EMAILS_PARKED). Ops mail (canary
                               alerts, listing reports, move-in problems) still
                               sends.
    /api/claim/[token]/publish answers 410. There is no claim EMAIL: an admin
                               generates the link and hands it over by hand.
    /api/cron/synthetic-en-listing   checks the showcase instead of a listing
                               page (the listing page would be a redirect).
    scripts/verify-deploy.mjs  same swap for the post-deploy smoke test.

  Deliberately NOT parked:
    - /api/*. The middleware matcher skips /api, nothing public links to it any
      more, and the routes keep their own auth. The canary still exercises the
      listings API, which is what keeps it healthy for the return.
    - Cron jobs that only touch the database (distance healing, response
      times, booking expiry). They keep the data honest for the return.

  The three live flats' old listing URLs go to their new property pages rather
  than `/`, since those pages show the same flats (LISTING_TO_PROPERTY).

  History: the flag shipped `false` (#625), the showcase was built behind it
  (#626), and it was flipped on in its own PR. Never park the platform without
  the showcase up: with SHOWCASE_LIVE off, `/` is boarding's redirect to the
  housing landing, and sending the housing pages to `/` would loop.

  TO BRING THE PLATFORM BACK:
    - All of it: set SHOWCASE_LIVE to false. Every parked page, email and
      check is back as it was, and `/` returns to boardingParked.js's rule.
      The showcase pages gate on the same flag, so they go dark too; to keep
      both, make the homepage decision first and stop those pages gating.
    - One product at a time: remove its segment from PARKED_PREFIXES (the
      tests pin the list), and re-enable its emails by hand if it sends any.
    - Either way, rerun `node scripts/verify-deploy.mjs` and the canary by
      hand (CLAUDE.md, "Synthetic monitoring").

  Explicit `.js` extension on the import above is deliberate: scripts/
  verify-deploy.mjs imports this file under plain Node, which (unlike the
  bundler) does not resolve extensionless specifiers.
*/
export const SHOWCASE_LIVE = true; // live since the go-live PR; see the header

/** True while the platform's user-facing emails must not send. */
export const PLATFORM_EMAILS_PARKED = SHOWCASE_LIVE;

/**
 * First path segments of everything that is parked once the showcase is live.
 * Matched as a whole segment, so `/gigs` and `/gigs/x` match and `/gigsx` does
 * not. `/boarding` was already parked by boardingParked.js; listing it here
 * sends it to the showcase instead of the housing landing.
 */
export const PARKED_PREFIXES = Object.freeze([
  'property',
  'student',
  'login',
  'signup',
  'resources',
  'gigs',
  'admin',
  'claim',
  'admissions',
  'boarding',
]);

/** Paths that move to a showcase page rather than to `/`. */
export const MOVED_PATHS = Object.freeze({
  '/about': '/about-us',
});

/**
 * The three live flats are properties 101-103 on the showcase. Their old
 * listing pages go straight to the new property pages.
 */
export const LISTING_TO_PROPERTY = Object.freeze({
  '0106001': '101',
  '0106002': '102',
  '0106003': '103',
});

const LISTING_PATH = /^\/property\/[^/]+\/listing\/([^/]+)\/?$/;

/** True for a path under one of PARKED_PREFIXES. */
export function isParkedPath(pathname) {
  const first = String(pathname || '').split('/')[1] || '';
  return PARKED_PREFIXES.includes(first);
}

/**
 * Where the middleware should send `pathname`, or null to let it through.
 * Owns BOTH parking layers (this one and boarding's), so the order between
 * them lives in one place and the tests can walk every chain for loops. The
 * middleware imports this; it can't be imported under Vitest itself.
 *
 * `live` and `boardingHome` are parameters only so the tests can exercise both
 * states of the flag; callers use the defaults.
 */
export function parkedRedirectTarget(
  pathname,
  { live = SHOWCASE_LIVE, boardingHome = PARKED_HOME_TARGET } = {},
) {
  const path = pathname || '/';

  if (live) {
    const trimmed = path.length > 1 ? path.replace(/\/$/, '') : path;
    if (MOVED_PATHS[trimmed]) return MOVED_PATHS[trimmed];

    const listing = LISTING_PATH.exec(path);
    if (listing && LISTING_TO_PROPERTY[listing[1]]) {
      return `/featured-properties/${LISTING_TO_PROPERTY[listing[1]]}`;
    }

    if (isParkedPath(path)) return '/';
    return null;
  }

  // Not live: boarding's parking, exactly as before this file existed. `/`
  // goes too, since the two-product front door is half boarding.
  if (boardingHome && (path === '/' || isBoardingPath(path))) return boardingHome;
  return null;
}

/**
 * The attribute each showcase page renders on its root, e.g.
 * `data-showcase-page="home"` or `data-showcase-page="property-101"`. The
 * canary and verify-deploy assert it; it is an attribute rather than copy
 * because next-intl inlines every message into every page (CLAUDE.md,
 * "Synthetic monitoring"). Pages render it with `{...showcasePageProps(id)}`.
 */
export const SHOWCASE_PAGE_ATTR = 'data-showcase-page';

export function showcaseMarker(id) {
  return `${SHOWCASE_PAGE_ATTR}="${id}"`;
}

export function showcasePageProps(id) {
  return { [SHOWCASE_PAGE_ATTR]: id };
}

/**
 * Logs and reports a skipped user-facing email. Senders call it first:
 *
 *   if (platformEmailParked('booking-accepted')) return;
 *
 * The log line is what shows in `wrangler tail` if anyone wonders why a
 * landlord got nothing.
 */
export function platformEmailParked(kind, parked = PLATFORM_EMAILS_PARKED) {
  if (!parked) return false;
  console.log(`[email] kind=${kind} outcome=skipped reason=platform-parked`);
  return true;
}
