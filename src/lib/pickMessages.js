// Trims the next-intl message catalog down to what a given route's client
// components actually consume, before it's handed to NextIntlClientProvider
// (#260, narrowed per-route in #564). Server components use getTranslations()
// and read the full catalog on the server, so they're unaffected — this only
// shrinks what gets serialized into the HTML on every page.
//
// WHY PER-ROUTE, AND WHY THE ROOT SET IS TINY
//
// #260 applied one allow-list once, in the root layout. That list had to be
// the union of every route's needs, so it kept 10 top-level namespaces —
// 64 KB, 87% of the catalog — and shipped all 398 `landlord.*` keys and all
// 85 `admin.*` keys to anonymous visitors on every public page.
//
// use-intl's provider REPLACES messages rather than merging them:
//
//   messages: messages === undefined ? prevContext?.messages : messages
//   (use-intl/dist/.../react.js, IntlProvider)
//
// so a nested provider must carry everything its subtree needs, and the root
// provider's set is still serialized above it. That is why ROOT_NAMESPACES is
// cut to the four paths the always-mounted chrome needs (Navbar,
// FavoritesProvider, GigFavoritesProvider) — 2.7 KB. Whatever it holds is
// paid on every page AND duplicated under every nested provider, so it must
// stay small. Do not add a namespace here to fix a MISSING_MESSAGE in a
// route; add it to that route's set.
//
// Paths are dotted and may name a subtree ('propylaea.results'), which is
// what makes the root set small enough for nesting to be worth it. Naming a
// whole top-level namespace ('listing') still works and keeps the subtree.

/**
 * Returns a catalog containing only `paths`, preserving nesting so
 * useTranslations('a.b') still resolves.
 *
 * A path whose ancestor is also listed is redundant but harmless. A path that
 * isn't in the catalog is skipped rather than throwing — the completeness
 * test is what catches a typo, and a hard throw here would take a page down
 * for a missing translation.
 *
 * @param {Record<string, unknown>} messages full message catalog (en.json)
 * @param {string[]} paths dotted namespace paths to keep
 */
export function pickMessages(messages, paths) {
  const out = {};
  // Drop any path an ancestor already covers, BEFORE building. Order matters
  // and cannot be assumed: withRoot() puts 'student.gate' ahead of 'student',
  // and without this the ancestor would find a partial object already at
  // out.student and leave it — silently shipping two of student's 15 subtrees
  // and a MISSING_MESSAGE for the rest. Caught by the byte-size check, not by
  // the completeness test, which only inspects the declared list.
  const effective = paths.filter(
    (path) => !paths.some((other) => other !== path && path.startsWith(`${other}.`)),
  );
  for (const path of effective) {
    const segments = path.split('.');
    let src = messages;
    let ok = true;
    for (const segment of segments) {
      if (src == null || typeof src !== 'object' || !(segment in src)) {
        ok = false;
        break;
      }
      src = src[segment];
    }
    if (!ok) continue;

    let dest = out;
    for (const segment of segments.slice(0, -1)) {
      if (typeof dest[segment] !== 'object' || dest[segment] === null) {
        dest[segment] = {};
      }
      dest = dest[segment];
    }
    const leaf = segments[segments.length - 1];
    // An ancestor already copied the whole subtree — don't narrow it back.
    if (dest[leaf] === undefined) dest[leaf] = src;
  }
  return out;
}

// Always mounted, so paid by every page: Navbar (nav), FavoritesProvider
// (student.favorites, student.gate) and GigFavoritesProvider (gigs.favorites).
// 2.7 KB raw. Keep it that way — see the header.
export const ROOT_NAMESPACES = [
  'gigs.favorites',
  'nav',
  'student.favorites',
  'student.gate',
];

// Every route set includes the root set. Not belt-and-braces: the shared
// chrome components appear INSIDE route subtrees as well as above them —
// FavoriteButton (student.favorites) sits on listing cards, SavedGigs
// (gigs.favorites) inside /student — and a nested provider REPLACES the
// inherited messages, so a component that works at the root would throw
// MISSING_MESSAGE one level down. The completeness test catches exactly this;
// these four paths cost ~2.7 KB and are already serialized by the root
// provider regardless.
const withRoot = (...paths) => [...ROOT_NAMESPACES, ...paths];

// /property and everything under it EXCEPT the landlord dashboard, which
// nests its own provider below (see PROPERTY_LANDLORD_NAMESPACES). The
// landlord tree therefore also carries this set without using it — accepted:
// it is authenticated, low-traffic, and the alternative is a route-group
// restructure of the whole directory for ~15 KB on pages that already load a
// wizard.
export const PROPERTY_PUBLIC_NAMESPACES = withRoot(
  'listing',
  'listingCard',
  'propertyVerification',
  'propylaea.carousel',
  'propylaea.dateRange',
  'propylaea.filtersModal',
  'propylaea.gallery',
  'propylaea.hub',
  'propylaea.landing',
  'propylaea.listing.booking',
  'propylaea.listing.calendar',
  'propylaea.quiz',
  'propylaea.report',
  'propylaea.results',
  'propylaea.search',
  'student.profile',
);

export const PROPERTY_LANDLORD_NAMESPACES = withRoot(
  'landlord',
  'loaders',
  'propertyVerification',
  'propylaea.gallery',
  'propylaea.landlord',
  'student.chat',
);

export const STUDENT_NAMESPACES = withRoot(
  'gigs.card',
  'listingCard',
  'loaders',
  'propertyVerification',
  'propylaea.results',
  'student',
);

export const ADMIN_NAMESPACES = withRoot('admin');

export const GIGS_NAMESPACES = withRoot('gigs', 'propylaea.gallery');

// Every per-route set, for the completeness test. Keys are the route
// directory under src/app/[locale]; `exclude` marks a subtree that provides
// its own set below this one.
export const ROUTE_NAMESPACE_SETS = [
  { dir: '', namespaces: ROOT_NAMESPACES, rootLayoutOnly: true },
  { dir: 'property', namespaces: PROPERTY_PUBLIC_NAMESPACES, exclude: ['property/[city]/landlord'] },
  { dir: 'property/[city]/landlord', namespaces: PROPERTY_LANDLORD_NAMESPACES },
  { dir: 'student', namespaces: STUDENT_NAMESPACES },
  { dir: 'admin', namespaces: ADMIN_NAMESPACES },
  { dir: 'gigs', namespaces: GIGS_NAMESPACES },
];
