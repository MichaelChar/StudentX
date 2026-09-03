import { describe, it, expect } from 'vitest';
import {
  isListingDisabled,
  listingChipStatus,
  listingsSummary,
} from '@/lib/hostListingStatus';

const live = { listing_status: 'active', flags: { disabled: false } };
const draft = { listing_status: 'disabled', flags: { listing_status: 'draft' } };

describe('isListingDisabled', () => {
  /*
    Two spellings exist in the data — a boolean flag and a flags.listing_status
    of 'disabled'. The listings page checks both, so this must too, or the grid
    and the row list disagree about the same listing.
  */
  it('accepts either spelling the data uses', () => {
    expect(isListingDisabled({ flags: { disabled: true } })).toBe(true);
    expect(isListingDisabled({ flags: { listing_status: 'disabled' } })).toBe(true);
  });

  it('is false for a live listing and for nothing at all', () => {
    expect(isListingDisabled(live)).toBe(false);
    expect(isListingDisabled(null)).toBe(false);
    expect(isListingDisabled({})).toBe(false);
  });
});

describe('listingChipStatus', () => {
  it('marks a publicly active listing as needing nothing', () => {
    expect(listingChipStatus(live)).toEqual({ needsAction: false, reason: 'live' });
  });

  it('marks anything not yet public as needing action', () => {
    expect(listingChipStatus(draft)).toEqual({ needsAction: true, reason: 'not_live' });
    expect(listingChipStatus({ listing_status: 'disabled' })).toEqual({
      needsAction: true,
      reason: 'not_live',
    });
  });

  /*
    A landlord who deliberately took a listing offline still sees the chip.
    The binary has no third state, and the listing genuinely is not earning —
    but the reason is carried separately so the banner can say "you disabled
    this" rather than implying a fault.
  */
  it('separates a deliberate disable from never-published', () => {
    const disabled = { listing_status: 'active', flags: { disabled: true } };
    expect(listingChipStatus(disabled)).toEqual({ needsAction: true, reason: 'disabled' });
  });

  /*
    listing_status='active' is admin-only and its default is 'disabled', so
    "not active" is the overwhelmingly common case for a new listing. It must
    never read as live.
  */
  it('never calls an unpublished listing live, whatever the wizard flags say', () => {
    const submitted = {
      listing_status: 'disabled',
      flags: { listing_status: 'submitted', admin_live_approved: false },
    };
    expect(listingChipStatus(submitted).needsAction).toBe(true);
  });

  it('survives being handed nothing', () => {
    expect(listingChipStatus(null).needsAction).toBe(true);
    expect(listingChipStatus(undefined).needsAction).toBe(true);
  });
});

describe('listingsSummary', () => {
  it('counts live against total', () => {
    expect(listingsSummary([live, live, draft])).toEqual({
      total: 3,
      live: 2,
      needsAction: 1,
    });
  });

  it('is all zeroes for an empty or missing list', () => {
    expect(listingsSummary([])).toEqual({ total: 0, live: 0, needsAction: 0 });
    expect(listingsSummary(null)).toEqual({ total: 0, live: 0, needsAction: 0 });
  });

  /*
    The production account's actual shape: three listings, all active. The
    grid must show no attention chips at all for it.
  */
  it('reports nothing needing action for the current production account', () => {
    expect(listingsSummary([live, live, live]).needsAction).toBe(0);
  });
});
