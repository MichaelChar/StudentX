/*
  The listings grid's status chip — parity Feature 50.

  Feature 50 is emphatic that the chip is BINARY: `Listed` or `Action
  required`, exactly as Airbnb, and "the granular states are not chips". The
  five go-live states (draft, submitted, awaiting ID check, awaiting video
  call, awaiting admin approval) live in the action-required banner, which
  ships with Feature 51 — the banner needs the editor's section list to have
  somewhere to deep-link, and a linear wizard has no such landing point.

  ASYMMETRY IS THE POINT, and it was decided before this file existed — see the
  block comment in `components/ui/Pill.js`. `Listed` renders neutral with no
  dot; `Action required` renders magenta WITH one. Only the state that needs a
  response carries colour, so the eye finds the listing that needs you instead
  of counting healthy ones. There is deliberately no green in the palette.
*/

/**
 * Landlord has taken this listing offline on purpose — distinct from
 * "not yet published". Mirrors the check in the listings page.
 *
 * @param {{ flags?: object }|null} listing
 */
export function isListingDisabled(listing) {
  return Boolean(
    listing?.flags?.disabled === true || listing?.flags?.listing_status === 'disabled',
  );
}

/**
 * Binary chip state for one listing.
 *
 * A landlord-DISABLED listing counts as needing action. That is a real
 * judgement call and worth stating: taking a listing offline is a deliberate
 * choice, not a fault, so flagging it can read as a scolding. It still earns
 * the chip because the binary has no third state and the listing genuinely is
 * not earning — the card says only that something stands between it and being
 * live, and the banner (Feature 51) says what.
 *
 * @param {{ listing_status?: string, flags?: object }|null} listing
 * @returns {{ needsAction: boolean, reason: 'live'|'disabled'|'not_live' }}
 */
export function listingChipStatus(listing) {
  if (isListingDisabled(listing)) return { needsAction: true, reason: 'disabled' };
  if (listing?.listing_status === 'active') return { needsAction: false, reason: 'live' };
  return { needsAction: true, reason: 'not_live' };
}

/**
 * How many of a landlord's listings still need something.
 *
 * Drives the count the banner will show, and lets the grid header say
 * "2 of 3 live" without every card recomputing it.
 *
 * @param {Array|null} listings
 * @returns {{ total: number, live: number, needsAction: number }}
 */
export function listingsSummary(listings) {
  const rows = Array.isArray(listings) ? listings : [];
  let live = 0;
  for (const listing of rows) {
    if (!listingChipStatus(listing).needsAction) live += 1;
  }
  return { total: rows.length, live, needsAction: rows.length - live };
}
