/**
 * Listing go-live gates + status ladder derivation.
 *
 * Public visibility is listings.listing_status = 'active' only after an
 * ADMIN_EMAILS operator approves go-live. Landlord submit never publishes.
 *
 * Ladder (no curation): Draft → ID check → Video call → Live
 * ID check is account-level (landlords.is_verified) — UI only, all listings.
 */

import { isPropertyVerified } from '@/lib/propertyVerification';

export const LISTING_LADDER_STAGES = ['draft', 'idCheck', 'videoCall', 'live'];

/** Wizard/pipeline flags.listing_status values we understand. */
export const FLAGS_DRAFT = 'draft';
export const FLAGS_SUBMITTED = 'submitted';
export const FLAGS_LIVE = 'live';
export const FLAGS_DISABLED = 'disabled';

/**
 * Landlord has completed free admin ID verification.
 * @param {{ is_verified?: boolean } | boolean | null | undefined} landlordOrFlag
 */
export function isLandlordIdVerified(landlordOrFlag) {
  if (typeof landlordOrFlag === 'boolean') return landlordOrFlag;
  return Boolean(landlordOrFlag && landlordOrFlag.is_verified === true);
}

/**
 * Listing has left draft (submitted for review, or previously live).
 * @param {{ flags?: object, listing_status?: string } | null | undefined} listing
 */
export function isListingSubmitted(listing) {
  if (!listing) return false;
  const flag = listing.flags?.listing_status;
  if (flag === FLAGS_SUBMITTED || flag === FLAGS_LIVE) return true;
  // Public active always counts as past draft (legacy rows).
  if (listing.listing_status === 'active') return true;
  if (listing.flags?.admin_live_approved === true) return true;
  return false;
}

/**
 * Admin previously approved this listing for public live (may be landlord-disabled).
 */
export function isAdminLiveApproved(listing) {
  return Boolean(listing?.flags?.admin_live_approved === true);
}

/**
 * Video-call property verification complete for this listing.
 * @param {Array|undefined} propertyVerifications
 */
export function isVideoVerified(propertyVerifications) {
  return isPropertyVerified(propertyVerifications);
}

/**
 * Whether admin may set listing_status = active.
 * @returns {{ ok: true } | { ok: false, missing: string[] }}
 */
export function canAdminGoLive({ isVerified, propertyVerifications, listing }) {
  const missing = [];
  if (!isListingSubmitted(listing)) missing.push('not_submitted');
  if (!isLandlordIdVerified(isVerified)) missing.push('id_check');
  if (!isVideoVerified(propertyVerifications)) missing.push('video_call');
  if (missing.length) return { ok: false, missing };
  return { ok: true };
}

/**
 * Per-stage completion + current step for the status ladder.
 *
 * Completion is intentionally non-linear for ID check: once the landlord is
 * verified, idCheck is done on EVERY listing (including pure drafts).
 *
 * @param {{
 *   flags?: object,
 *   listingStatus?: string|null,
 *   isVerified?: boolean,
 *   hasVideoVerification?: boolean,
 *   isSubmitted?: boolean,
 * }} args
 * @returns {{
 *   current: 'draft'|'idCheck'|'videoCall'|'live',
 *   completed: Record<'draft'|'idCheck'|'videoCall'|'live', boolean>,
 * }}
 */
export function deriveListingLadder({
  flags,
  listingStatus,
  isVerified = false,
  hasVideoVerification = false,
  isSubmitted = false,
} = {}) {
  const flagStatus = flags?.listing_status;
  const publicActive = listingStatus === 'active';
  const adminApproved = flags?.admin_live_approved === true;

  const submitted =
    isSubmitted ||
    flagStatus === FLAGS_SUBMITTED ||
    flagStatus === FLAGS_LIVE ||
    adminApproved ||
    publicActive;

  const completed = {
    // Draft complete once submitted (or live).
    draft: submitted,
    // Account-level — ticked on all properties when landlord is verified.
    idCheck: Boolean(isVerified),
    videoCall: Boolean(hasVideoVerification),
    live: publicActive || (adminApproved && listingStatus !== 'disabled' && flagStatus === FLAGS_LIVE),
  };

  // Live stage counts as completed when publicly active OR when admin approved
  // and landlord has not disabled (if disabled after approval, still show live done).
  if (publicActive || adminApproved) {
    completed.live = true;
    completed.draft = true;
  }

  // Current = first incomplete stage in order; if all complete, live.
  let current = 'live';
  for (const stage of LISTING_LADDER_STAGES) {
    if (!completed[stage]) {
      current = stage;
      break;
    }
  }

  return { current, completed };
}

/**
 * Back-compat: single "current" stage for callers that only need the highlight.
 */
export function deriveListingStage(args) {
  return deriveListingLadder(args).current;
}

/**
 * Build flags + listing_status for a landlord submit (never public).
 * @param {object} prevFlags
 */
export function flagsForSubmit(prevFlags = {}) {
  const prev = prevFlags && typeof prevFlags === 'object' ? prevFlags : {};
  // Already public + admin-approved: content re-submit keeps live state.
  if (prev.admin_live_approved === true && prev.listing_status === FLAGS_LIVE) {
    return {
      flags: { ...prev, disabled: false, listing_status: FLAGS_LIVE },
      listing_status: 'active',
    };
  }
  return {
    flags: {
      ...prev,
      disabled: false,
      listing_status: FLAGS_SUBMITTED,
    },
    listing_status: 'disabled',
  };
}

/**
 * Build flags + listing_status for landlord disable toggle.
 * @param {boolean} disabled
 * @param {object} prevFlags
 * @param {string|null} prevListingStatus
 */
export function flagsForDisableToggle(disabled, prevFlags = {}, prevListingStatus = null) {
  const prev = prevFlags && typeof prevFlags === 'object' ? prevFlags : {};
  if (disabled) {
    return {
      ok: true,
      flags: {
        ...prev,
        disabled: true,
        listing_status: FLAGS_DISABLED,
      },
      listing_status: 'disabled',
    };
  }

  // Re-enable only restores public active when admin had approved go-live.
  if (prev.admin_live_approved === true) {
    return {
      ok: true,
      flags: {
        ...prev,
        disabled: false,
        listing_status: FLAGS_LIVE,
      },
      listing_status: 'active',
      restoredPublic: true,
    };
  }

  // Not admin-approved: clear landlord-disabled bit but stay off public.
  let nextFlag = prev.listing_status;
  if (!nextFlag || nextFlag === FLAGS_DISABLED) {
    nextFlag = FLAGS_DRAFT;
  }
  if (nextFlag === FLAGS_LIVE) {
    nextFlag = FLAGS_SUBMITTED;
  }

  return {
    ok: true,
    flags: {
      ...prev,
      disabled: false,
      listing_status: nextFlag,
    },
    listing_status: 'disabled',
    restoredPublic: false,
    prevListingStatus,
  };
}

/**
 * Flags after admin go-live approve.
 */
export function flagsForAdminGoLive(prevFlags = {}, adminEmail) {
  const prev = prevFlags && typeof prevFlags === 'object' ? prevFlags : {};
  return {
    flags: {
      ...prev,
      disabled: false,
      listing_status: FLAGS_LIVE,
      admin_live_approved: true,
      admin_live_at: new Date().toISOString(),
      admin_live_by: adminEmail || null,
    },
    listing_status: 'active',
  };
}

/**
 * Flags after admin revoke (take offline, keep submitted for re-approval).
 */
export function flagsForAdminRevoke(prevFlags = {}) {
  const prev = prevFlags && typeof prevFlags === 'object' ? prevFlags : {};
  const next = { ...prev, disabled: false, listing_status: FLAGS_SUBMITTED };
  delete next.admin_live_approved;
  delete next.admin_live_at;
  delete next.admin_live_by;
  return {
    flags: next,
    listing_status: 'disabled',
  };
}
