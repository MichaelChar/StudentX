import { listingBlocker } from '@/lib/hostToday';
import { firstIncompleteSection } from '@/lib/listingSections';

/*
  The action-required banner — parity Feature 50.

  Airbnb floats a "Confirm a few key details / Required to publish" card above
  the page, and it FOLLOWS THE HOST ACROSS TABS until resolved — it appears on
  both Listings and Messages in the captures. That is why this is computed in
  the nav summary, which every landlord page already fetches, rather than on
  the Listings page alone.

  ONE BLOCKER, NOT A LIST. A landlord with three unpublished listings has one
  next action, not three; and a listing with three missing things has one first
  step. The banner names that step and links to it. `listingGoLive.js` decides
  what is blocking — this module only decides which blocker to surface first
  and where to send the landlord.

  THE ROUTING IS THE WHOLE POINT, and two of the blockers are not listing
  fields at all:

    id_check      -> landlord/verification   (account-level, unblocks everything)
    submit        -> the specific editor SECTION, via Feature 51's ?section=
    video_call    -> landlord/verification   (scheduling lives there)
    admin_review  -> nowhere. Read-only: there is nothing for the landlord to do

  The `submit` case is why Feature 51 had to land first. A linear wizard has no
  landing point — it can only restart the flow — so the banner would have had
  nowhere to send anyone.
*/

/** Blockers a landlord can actually act on. `admin_review` is not one. */
const ACTIONABLE = new Set(['id_check', 'submit', 'video_call']);

/**
 * Pick the single blocker to surface, across all of a landlord's listings.
 *
 * Order follows `listingBlocker`'s own ranking, which puts the account-level
 * ID check ahead of anything per-listing: it unblocks every listing at once,
 * so telling a landlord to finish a draft while their ID is unverified sends
 * them to the second-most-useful screen.
 *
 * Pure — exported for unit testing.
 *
 * @param {{
 *   listings?: Array<object>|null,
 *   isVerified?: boolean,
 * }} args
 * @returns {{ blocker: string, listingId: string|null, section: string|null,
 *             actionable: boolean }|null}
 */
export function pickActionRequired({ listings, isVerified } = {}) {
  const rows = Array.isArray(listings) ? listings : [];
  if (rows.length === 0) return null;

  const found = [];
  for (const listing of rows) {
    const result = listingBlocker({
      listing,
      isVerified,
      propertyVerifications: listing?.property_verifications,
    });
    if (result) found.push({ ...result, listing });
  }
  if (found.length === 0) return null;

  /*
    Rank by how much a landlord unblocks by acting. ID check first (every
    listing), then their own submission, then the two that wait on someone
    else. Ties break on listing order, which is newest-first from the API.
  */
  const RANK = { id_check: 0, submit: 1, video_call: 2, admin_review: 3 };
  found.sort((a, b) => (RANK[a.blocker] ?? 9) - (RANK[b.blocker] ?? 9));
  const top = found[0];

  return {
    blocker: top.blocker,
    listingId: top.listing?.listing_id ?? null,
    // Only the `submit` case deep-links into the editor; the others go to
    // verification or nowhere, so computing a section for them is wasted work.
    section: top.blocker === 'submit' ? firstIncompleteSection(top.listing) : null,
    actionable: ACTIONABLE.has(top.blocker),
  };
}

/**
 * Where the banner's link should point.
 *
 * Returns null for `admin_review` — nothing for the landlord to do, so the
 * banner renders as a status line rather than a call to action. A link that
 * goes nowhere useful is worse than no link.
 *
 * @param {{ blocker: string, listingId: string|null, section: string|null }|null} action
 * @param {string} city
 * @returns {string|null}
 */
export function actionRequiredHref(action, city = 'thessaloniki') {
  if (!action) return null;
  const base = `/property/${city}/landlord`;
  switch (action.blocker) {
    case 'id_check':
    case 'video_call':
      return `${base}/verification`;
    case 'submit': {
      if (!action.listingId) return `${base}/listings`;
      const q = action.section ? `?section=${action.section}` : '';
      return `${base}/listings/${action.listingId}/edit${q}`;
    }
    default:
      return null;
  }
}
