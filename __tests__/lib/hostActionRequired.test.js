import { describe, it, expect } from 'vitest';
import { actionRequiredHref, pickActionRequired } from '@/lib/hostActionRequired';

const live = {
  listing_id: '0106001',
  listing_status: 'active',
  flags: { disabled: false, admin_live_approved: true, listing_status: 'live' },
  property_verifications: [{ status: 'approved', verified_at: '2026-08-01T00:00:00Z' }],
};

const draft = (id = '0106009') => ({
  listing_id: id,
  listing_status: 'disabled',
  flags: { listing_status: 'draft' },
  property_verifications: [],
});

describe('pickActionRequired', () => {
  it('is null when every listing is live', () => {
    expect(pickActionRequired({ listings: [live, live], isVerified: true })).toBeNull();
  });

  it('is null when the landlord has no listings at all', () => {
    expect(pickActionRequired({ listings: [], isVerified: true })).toBeNull();
    expect(pickActionRequired({ listings: null, isVerified: true })).toBeNull();
    expect(pickActionRequired()).toBeNull();
  });

  /*
    The ID check is account-level: clearing it unblocks every listing at once.
    Telling a landlord to finish a draft while their ID is unverified sends
    them to the second-most-useful screen.
  */
  it('puts the account-level ID check ahead of any per-listing step', () => {
    const result = pickActionRequired({
      listings: [draft('0106009'), draft('0106010')],
      isVerified: false,
    });
    expect(result.blocker).toBe('id_check');
    expect(result.actionable).toBe(true);
  });

  it('asks for submission once the landlord is verified', () => {
    const result = pickActionRequired({ listings: [draft()], isVerified: true });
    expect(result.blocker).toBe('submit');
  });

  /*
    Only the submit case deep-links into the editor, so only it pays for
    computing a section. The others route to verification or nowhere.
  */
  it('computes a deep-link section for submit and nothing else', () => {
    const submit = pickActionRequired({ listings: [draft()], isVerified: true });
    expect(submit.section).toBe('photos');

    const idCheck = pickActionRequired({ listings: [draft()], isVerified: false });
    expect(idCheck.section).toBeNull();
  });

  it('marks admin review as not actionable', () => {
    const awaiting = {
      listing_id: '0106011',
      listing_status: 'disabled',
      flags: { listing_status: 'submitted' },
      property_verifications: [{ status: 'approved', verified_at: '2026-08-01T00:00:00Z' }],
    };
    const result = pickActionRequired({ listings: [awaiting], isVerified: true });
    expect(result).toMatchObject({ blocker: 'admin_review', actionable: false });
  });

  /*
    One blocker, not a list. Three unpublished listings is still one next
    action; a banner listing three things is a to-do list, not a prompt.
  */
  it('surfaces exactly one blocker however many listings are stuck', () => {
    const result = pickActionRequired({
      listings: [draft('a'), draft('b'), draft('c')],
      isVerified: true,
    });
    expect(result.blocker).toBe('submit');
    expect(Array.isArray(result)).toBe(false);
  });

  it('ignores live listings when choosing which one to name', () => {
    const result = pickActionRequired({
      listings: [live, draft('0106009')],
      isVerified: true,
    });
    expect(result.listingId).toBe('0106009');
  });
});

describe('actionRequiredHref', () => {
  it('routes the two account-level blockers to verification', () => {
    expect(actionRequiredHref({ blocker: 'id_check' })).toBe(
      '/property/thessaloniki/landlord/verification',
    );
    expect(actionRequiredHref({ blocker: 'video_call' })).toBe(
      '/property/thessaloniki/landlord/verification',
    );
  });

  /*
    This is the link Feature 51 exists to make possible — straight to the one
    incomplete section, not back to the top of a wizard.
  */
  it('deep-links submit into the specific editor section', () => {
    expect(
      actionRequiredHref({ blocker: 'submit', listingId: '0106009', section: 'price' }),
    ).toBe('/property/thessaloniki/landlord/listings/0106009/edit?section=price');
  });

  it('falls back to the listings index when it has no listing to open', () => {
    expect(actionRequiredHref({ blocker: 'submit', listingId: null })).toBe(
      '/property/thessaloniki/landlord/listings',
    );
  });

  it('omits the query when no section could be determined', () => {
    expect(
      actionRequiredHref({ blocker: 'submit', listingId: '0106009', section: null }),
    ).toBe('/property/thessaloniki/landlord/listings/0106009/edit');
  });

  /*
    A link that goes nowhere useful is worse than no link: the banner renders
    as a status line instead.
  */
  it('gives admin review no link at all', () => {
    expect(actionRequiredHref({ blocker: 'admin_review', listingId: 'x' })).toBeNull();
  });

  it('is null for no action', () => {
    expect(actionRequiredHref(null)).toBeNull();
  });

  it('honours a non-default city', () => {
    expect(actionRequiredHref({ blocker: 'id_check' }, 'athens')).toBe(
      '/property/athens/landlord/verification',
    );
  });
});
