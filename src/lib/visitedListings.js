/*
  "Visited" listing ids — the state behind the solid-black map pins
  (parity Feature 12).

  WHY localStorage and not the database:

  The feature is "show me where I have already looked". That has to survive a
  page load or the pin never gets to mean anything — a student browses, opens
  three listings, comes back, and the map should show which three. Holding it
  in React state would reset on every navigation, which is exactly when the
  answer matters.

  It is deliberately NOT a server-side record:

  - It must work for signed-out students. The whole /property directory is
    browsable without an account, and that is the audience doing the most
    comparing. `listing_views` (see ViewTracker) is auth-gated and exists for
    landlord metrics, so it can answer neither this question nor for this
    audience.
  - It is a private browsing trail. Keeping it on the device means it is never
    transmitted, never joined to a student row, and never something we have to
    explain in a privacy policy.
  - Being per-device is honest about what it knows. A student on a phone and a
    laptop genuinely has two separate browsing sessions, and a pin that claimed
    otherwise would be guessing.

  The cost is that it is per-device and clearable, which is the right trade for
  a soft visual hint. Nothing depends on it being complete or authoritative.
*/

const STORAGE_KEY = 'sx.visitedListings';

// Bounded so a heavy browsing session can't grow the entry without limit.
// Oldest ids fall off first; at that point the pin has long stopped being a
// useful "recently looked at" signal anyway.
const MAX_VISITED = 200;

function canUseStorage() {
  // Safari in private mode throws on access rather than returning null, and
  // this runs during SSR too, so both need catching rather than a truthiness
  // check on window.
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function readRaw() {
  if (!canUseStorage()) return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Read the visited-listing ids, most recently visited last.
 * Returns [] on any failure — a corrupt or unreadable entry means "nothing
 * visited", never a thrown error on a browsing page.
 *
 * @returns {string[]}
 */
export function readVisitedListings() {
  return parseRaw(readRaw());
}

function parseRaw(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === 'string');
  } catch {
    return [];
  }
}

/**
 * Record a listing as visited. Idempotent, and re-visiting moves the id to the
 * most-recent end rather than duplicating it.
 *
 * @param {string} listingId
 * @returns {string[]} the updated list (also returned on failure, unchanged)
 */
export function markListingVisited(listingId) {
  if (!listingId || !canUseStorage()) return readVisitedListings();
  try {
    const current = readVisitedListings().filter((id) => id !== listingId);
    const next = [...current, listingId].slice(-MAX_VISITED);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    // Quota exceeded or storage disabled — the pin just stays white.
    return readVisitedListings();
  }
}


/*
  useSyncExternalStore adapter — how ListingsMap reads this without tripping
  React's hydration check or the `set-state-in-effect` lint rule.

  The naive version (useState + read in an effect) is what this replaces. It
  works, but it is a synchronous setState in an effect body, which the repo's
  React Compiler lint rules reject on purpose: it renders once with the wrong
  answer and then immediately corrects it.

  getSnapshot MUST return a referentially stable value between real changes or
  React re-renders forever, so the parsed Set is memoised against the raw
  string it came from.
*/

const EMPTY_VISITED = new Set();

let cachedRaw;
let cachedSet = EMPTY_VISITED;

/** @returns {Set<string>} */
export function getVisitedSnapshot() {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedSet = raw ? new Set(parseRaw(raw)) : EMPTY_VISITED;
  }
  return cachedSet;
}

/**
 * Server render has no localStorage, so it renders every pin unvisited and the
 * client corrects on hydration. Must be a stable reference across calls, hence
 * one shared empty set rather than a fresh `new Set()` each time.
 *
 * @returns {Set<string>}
 */
export function getVisitedServerSnapshot() {
  return EMPTY_VISITED;
}

/**
 * The `storage` event only fires for OTHER tabs, which is all this needs:
 * within a tab the set changes on the listing detail page, and returning to
 * results remounts the map. Two tabs open on the directory stay in step for
 * free.
 *
 * @param {() => void} onChange
 * @returns {() => void} unsubscribe
 */
export function subscribeVisited(onChange) {
  if (typeof window === 'undefined') return () => {};
  const handler = (e) => {
    if (e.key === null || e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
