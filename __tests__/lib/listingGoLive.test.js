import { describe, it, expect } from 'vitest';
import {
  deriveListingLadder,
  deriveListingStage,
  canAdminGoLive,
  flagsForSubmit,
  flagsForDisableToggle,
  flagsForAdminGoLive,
  flagsForAdminRevoke,
  isListingSubmitted,
  LISTING_LADDER_STAGES,
} from '@/lib/listingGoLive';

describe('LISTING_LADDER_STAGES', () => {
  it('has no curation stage', () => {
    expect(LISTING_LADDER_STAGES).toEqual([
      'draft',
      'idCheck',
      'videoCall',
      'live',
    ]);
  });
});

describe('deriveListingLadder — ID check is account-level', () => {
  it('ticks idCheck on every listing when landlord is verified, including pure drafts', () => {
    const ladder = deriveListingLadder({
      flags: { listing_status: 'draft' },
      listingStatus: 'disabled',
      isVerified: true,
      hasVideoVerification: false,
    });
    expect(ladder.completed.idCheck).toBe(true);
    expect(ladder.completed.draft).toBe(false);
    expect(ladder.current).toBe('draft');
  });

  it('does not tick idCheck when landlord is not verified', () => {
    const ladder = deriveListingLadder({
      flags: { listing_status: 'submitted' },
      listingStatus: 'disabled',
      isVerified: false,
      hasVideoVerification: false,
      isSubmitted: true,
    });
    expect(ladder.completed.idCheck).toBe(false);
    expect(ladder.current).toBe('idCheck');
  });

  it('shows videoCall as current when submitted + ID done, video missing', () => {
    const ladder = deriveListingLadder({
      flags: { listing_status: 'submitted' },
      listingStatus: 'disabled',
      isVerified: true,
      hasVideoVerification: false,
      isSubmitted: true,
    });
    expect(ladder.completed.draft).toBe(true);
    expect(ladder.completed.idCheck).toBe(true);
    expect(ladder.completed.videoCall).toBe(false);
    expect(ladder.current).toBe('videoCall');
  });

  it('shows live as current (waiting) when submitted + ID + video but not public', () => {
    const ladder = deriveListingLadder({
      flags: { listing_status: 'submitted' },
      listingStatus: 'disabled',
      isVerified: true,
      hasVideoVerification: true,
      isSubmitted: true,
    });
    expect(ladder.completed.videoCall).toBe(true);
    expect(ladder.completed.live).toBe(false);
    expect(ladder.current).toBe('live');
  });

  it('marks live complete when publicly active', () => {
    const ladder = deriveListingLadder({
      flags: { listing_status: 'live', admin_live_approved: true },
      listingStatus: 'active',
      isVerified: true,
      hasVideoVerification: true,
    });
    expect(ladder.completed.live).toBe(true);
    expect(ladder.current).toBe('live');
  });
});

describe('deriveListingStage', () => {
  it('returns current from the ladder', () => {
    expect(
      deriveListingStage({
        flags: { listing_status: 'submitted' },
        isVerified: true,
        hasVideoVerification: false,
        isSubmitted: true,
      }),
    ).toBe('videoCall');
  });
});

describe('canAdminGoLive', () => {
  const pvOk = [{ verified_at: '2026-08-01T00:00:00Z', method: 'video_call' }];

  it('requires submit + ID + video', () => {
    expect(
      canAdminGoLive({
        isVerified: true,
        propertyVerifications: pvOk,
        listing: { flags: { listing_status: 'submitted' }, listing_status: 'disabled' },
      }).ok,
    ).toBe(true);

    expect(
      canAdminGoLive({
        isVerified: false,
        propertyVerifications: pvOk,
        listing: { flags: { listing_status: 'submitted' } },
      }),
    ).toEqual({ ok: false, missing: ['id_check'] });

    expect(
      canAdminGoLive({
        isVerified: true,
        propertyVerifications: [],
        listing: { flags: { listing_status: 'submitted' } },
      }),
    ).toEqual({ ok: false, missing: ['video_call'] });

    expect(
      canAdminGoLive({
        isVerified: true,
        propertyVerifications: pvOk,
        listing: { flags: { listing_status: 'draft' }, listing_status: 'disabled' },
      }),
    ).toEqual({ ok: false, missing: ['not_submitted'] });
  });
});

describe('flagsForSubmit', () => {
  it('never sets public active for a first-time submit', () => {
    const next = flagsForSubmit({ listing_status: 'draft' });
    expect(next.listing_status).toBe('disabled');
    expect(next.flags.listing_status).toBe('submitted');
  });

  it('keeps live when already admin-approved', () => {
    const next = flagsForSubmit({
      listing_status: 'live',
      admin_live_approved: true,
    });
    expect(next.listing_status).toBe('active');
    expect(next.flags.admin_live_approved).toBe(true);
  });
});

describe('flagsForDisableToggle', () => {
  it('restores active only when admin_live_approved', () => {
    const off = flagsForDisableToggle(true, {
      listing_status: 'live',
      admin_live_approved: true,
    });
    expect(off.listing_status).toBe('disabled');

    const on = flagsForDisableToggle(false, off.flags);
    expect(on.listing_status).toBe('active');
    expect(on.flags.listing_status).toBe('live');
  });

  it('does not publish on re-enable without admin approval', () => {
    const on = flagsForDisableToggle(false, {
      listing_status: 'disabled',
      disabled: true,
    });
    expect(on.listing_status).toBe('disabled');
    expect(on.restoredPublic).toBe(false);
  });
});

describe('admin go-live / revoke flags', () => {
  it('approve stamps admin_live_approved and sets active', () => {
    const next = flagsForAdminGoLive({ listing_status: 'submitted' }, 'ops@studentx.uk');
    expect(next.listing_status).toBe('active');
    expect(next.flags.admin_live_approved).toBe(true);
    expect(next.flags.admin_live_by).toBe('ops@studentx.uk');
    expect(next.flags.listing_status).toBe('live');
  });

  it('revoke clears approval and keeps submitted', () => {
    const next = flagsForAdminRevoke({
      listing_status: 'live',
      admin_live_approved: true,
      admin_live_by: 'ops@studentx.uk',
    });
    expect(next.listing_status).toBe('disabled');
    expect(next.flags.listing_status).toBe('submitted');
    expect(next.flags.admin_live_approved).toBeUndefined();
  });
});

describe('isListingSubmitted', () => {
  it('recognises submitted / live / active / admin approved', () => {
    expect(isListingSubmitted({ flags: { listing_status: 'submitted' } })).toBe(true);
    expect(isListingSubmitted({ flags: { listing_status: 'live' } })).toBe(true);
    expect(isListingSubmitted({ listing_status: 'active' })).toBe(true);
    expect(isListingSubmitted({ flags: { admin_live_approved: true } })).toBe(true);
    expect(isListingSubmitted({ flags: { listing_status: 'draft' } })).toBe(false);
  });
});
