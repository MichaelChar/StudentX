/*
  The mobile bottom tab bar's contents — parity Feature 56.

  Net-new: StudentX has no bottom tab bar. It is also what makes Features
  57–59 coherent — the chromeless PDP can drop its header only because
  navigation is held at the foot instead.

  THE TWO BARS NEVER COEXIST. Feature 55 skipped the host/guest role toggle, so
  a session is either landlord or student and the bar is chosen by role at
  render with no switching affordance. Simpler than Airbnb, which has to handle
  the transition between modes.

  TWO CONSEQUENCES, RECORDED RATHER THAN OVERRIDDEN (founder confirmed
  2026-09-04, "keep 4 tabs as specced"):

  1. Bookings is NOT a tab. Airbnb gives signed-in guests `Trips`; this bar
     does not, so a student's active booking sits under Profile, two taps deep
     — including Feature 44's pending state and its expiry countdown, which is
     the thing a waiting student checks most. Considered and kept.

  2. `/gigs`, `/resources` and `/student/ausom` are reachable only via Profile.
     Feature 3 skipped product tabs, so the account menu was already their sole
     route on desktop; on mobile three product areas now sit behind one icon,
     and mobile is where students are. This is Feature 3's discoverability cost
     arriving here rather than there.
*/

/**
 * Tabs for a session, by role.
 *
 * Returns descriptors — key, href, icon, and the message key for the label —
 * never rendered copy, so next-intl stays the only place strings live.
 *
 * `active` and `dot` are deliberately NOT decided here: the first needs the
 * current pathname and the second needs live unread state, and both belong to
 * the caller that already has them.
 *
 * @param {{ role?: 'landlord'|'student'|null, city?: string }} args
 * @returns {Array<{ key: string, href: string, icon: string, labelKey: string,
 *                   dotted?: boolean }>}
 */
export function mobileTabsFor({ role, city = 'thessaloniki' } = {}) {
  if (role === 'landlord') {
    // Mirrors the desktop host nav (Today · Listings · Messages) plus Profile.
    // No Calendar — Feature 52 is skipped.
    return [
      { key: 'today', href: `/property/${city}/landlord/dashboard`, icon: 'home', labelKey: 'today' },
      { key: 'listings', href: `/property/${city}/landlord/listings`, icon: 'grid', labelKey: 'listings' },
      { key: 'messages', href: `/property/${city}/landlord/inquiries`, icon: 'message', labelKey: 'messages', dotted: true },
      { key: 'profile', href: `/property/${city}/landlord/settings`, icon: 'compass', labelKey: 'profile' },
    ];
  }

  if (role === 'student') {
    return [
      { key: 'explore', href: `/property/${city}/results`, icon: 'search', labelKey: 'explore' },
      { key: 'wishlists', href: '/student/account/accommodation', icon: 'heart', labelKey: 'wishlists' },
      { key: 'messages', href: '/student/inquiries', icon: 'message', labelKey: 'messages', dotted: true },
      { key: 'profile', href: '/student/account/profile', icon: 'compass', labelKey: 'profile' },
    ];
  }

  /*
    Signed out: two tabs, not four. Wishlists and Messages both require an
    account, and a tab that only ever opens a login wall is a worse
    introduction than not offering it.
  */
  return [
    { key: 'explore', href: `/property/${city}/results`, icon: 'search', labelKey: 'explore' },
    { key: 'login', href: '/student/login', icon: 'logout', labelKey: 'logIn' },
  ];
}

/**
 * Is this tab the one currently open?
 *
 * Prefix matching, not equality: `/student/inquiries/abc` must still light
 * `Messages`, and a landlord editing a listing is still under `Listings`.
 *
 * Exact match is required for the two roots that are prefixes of everything
 * else beneath them — otherwise `Explore` would light on every `/property`
 * URL including a listing page, which belongs to no tab at all.
 *
 * @param {string|null} pathname
 * @param {string} href
 * @returns {boolean}
 */
export function isTabActive(pathname, href) {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

/**
 * Which tab, if any, the current path belongs to.
 * Returns the LONGEST matching href, so `/property/x/landlord/listings` picks
 * Listings rather than a shorter tab that also prefixes it.
 *
 * @param {Array} tabs
 * @param {string|null} pathname
 * @returns {string|null} tab key
 */
export function activeTabKey(tabs, pathname) {
  const rows = Array.isArray(tabs) ? tabs : [];
  let best = null;
  for (const tab of rows) {
    if (!isTabActive(pathname, tab.href)) continue;
    if (!best || tab.href.length > best.href.length) best = tab;
  }
  return best?.key ?? null;
}

/*
  The listing detail page, which is CHROMELESS below `md` — parity Features 58
  and 59. Both the floating account pill and the bottom tab bar come off,
  leaving the photo running to all four edges with only the floating back arrow
  and the sticky booking bar on it.

  That is the spec's decision, and it names its own consequence: a student
  landing here from a shared WhatsApp link reaches the rest of the site only by
  going back. Airbnb behaves identically.

  It lives here, next to the tabs themselves, because TWO components have to
  agree about it — `Navbar`, which decides whether to render the bar, and the
  spacer in the layout, which reserves the room the bar would occupy. Two
  copies of this regex would eventually disagree, and the failure would be a
  strip of dead space at the bottom of one route.
*/
const LISTING_PDP_RE = /^\/property\/[^/]+\/listing\/[^/]+\/?$/;

/**
 * Does this route drop its mobile chrome (tab bar + account pill) below `md`?
 *
 * @param {string|null|undefined} pathname
 * @returns {boolean}
 */
export function isChromelessMobileRoute(pathname) {
  return typeof pathname === 'string' && LISTING_PDP_RE.test(pathname);
}
