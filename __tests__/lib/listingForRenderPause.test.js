import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Issue #205 — pause / vacation mode.

  Michael chose SOFT-HIDE over 404 for a paused listing: the URL keeps
  working so shared links and index equity survive a listing that is
  expected to come back. That makes getListingForRender the one public
  query that must NOT pin listing_status = 'active'.

  The risk that creates is the whole reason these tests exist: relaxing
  the status filter must not leak listings that were never public —
  drafts, submissions awaiting review, or anything the admin go-live gate
  has not passed. The discriminator is flags.admin_live_approved, which
  only /api/admin/listing-go-live can stamp.
*/

let row;
const single = vi.fn(async () => ({ data: row, error: null }));
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ from: () => ({ select }) }),
}));
vi.mock('@/lib/transformListing', () => ({
  transformListing: (r) => ({ listing_id: r.listing_id }),
}));
vi.mock('@/lib/similarListings', () => ({ rankSimilarListings: () => [] }));
vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return { ...actual, cache: (fn) => fn }; // defeat per-request memoisation
});

const { getListingForRender } = await import('@/lib/listingForRender');

beforeEach(() => {
  row = null;
  vi.clearAllMocks();
});

describe('getListingForRender — paused listings (#205)', () => {
  it('returns an active listing with paused: false', async () => {
    row = { listing_id: '0106002', listing_status: 'active', flags: {} };
    expect(await getListingForRender('0106002')).toEqual({
      listing_id: '0106002',
      paused: false,
    });
  });

  it('SOFT-HIDES a listing the landlord paused after it went live', async () => {
    row = {
      listing_id: '0106002',
      listing_status: 'disabled',
      flags: { admin_live_approved: true, disabled: true },
    };
    expect(await getListingForRender('0106002')).toEqual({
      listing_id: '0106002',
      paused: true,
    });
  });

  it('404s a disabled listing that was NEVER admin-approved', async () => {
    // The leak this guards: without admin_live_approved, relaxing the
    // status filter would publish listings the go-live gate rejected.
    row = {
      listing_id: '0106009',
      listing_status: 'disabled',
      flags: { disabled: true },
    };
    expect(await getListingForRender('0106009')).toBeNull();
  });

  it('404s a draft', async () => {
    row = { listing_id: '0106010', listing_status: 'draft', flags: {} };
    expect(await getListingForRender('0106010')).toBeNull();
  });

  it('404s a listing submitted but awaiting review', async () => {
    row = {
      listing_id: '0106011',
      listing_status: 'disabled',
      flags: { listing_status: 'submitted' },
    };
    expect(await getListingForRender('0106011')).toBeNull();
  });

  it('treats a missing flags object as never-approved rather than paused', async () => {
    row = { listing_id: '0106012', listing_status: 'disabled', flags: null };
    expect(await getListingForRender('0106012')).toBeNull();
  });

  it('rejects a malformed id without querying', async () => {
    expect(await getListingForRender('abc')).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });
});
