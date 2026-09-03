import { describe, it, expect } from 'vitest';
import {
  listingBlocker,
  liveReservations,
  todayHeadline,
  waitingOnReply,
} from '@/lib/hostToday';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-09-03T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe('waitingOnReply', () => {
  it('merges pending inquiries and requested bookings into one queue', () => {
    const rows = waitingOnReply({
      inquiries: [{ inquiry_id: 'i1', status: 'pending', created_at: ago(2 * HOUR) }],
      bookings: [{ booking_id: 'b1', state: 'requested', created_at: ago(5 * HOUR) }],
    });
    expect(rows.map((r) => r.kind)).toEqual(['booking', 'inquiry']);
  });

  /*
    Oldest first is the whole point: the longest-waiting person is the one
    actually costing a booking, because students shotgun parallel requests and
    the losers auto-cancel.
  */
  it('sorts oldest first', () => {
    const rows = waitingOnReply({
      inquiries: [
        { inquiry_id: 'new', status: 'pending', created_at: ago(1 * HOUR) },
        { inquiry_id: 'old', status: 'pending', created_at: ago(9 * HOUR) },
        { inquiry_id: 'mid', status: 'pending', created_at: ago(4 * HOUR) },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['old', 'mid', 'new']);
  });

  it('ignores anything already answered or closed', () => {
    const rows = waitingOnReply({
      inquiries: [
        { inquiry_id: 'a', status: 'replied', created_at: ago(HOUR) },
        { inquiry_id: 'b', status: 'closed', created_at: ago(HOUR) },
      ],
      bookings: [
        { booking_id: 'c', state: 'accepted', created_at: ago(HOUR) },
        { booking_id: 'd', state: 'expired', created_at: ago(HOUR) },
        { booking_id: 'e', state: 'declined', created_at: ago(HOUR) },
      ],
    });
    expect(rows).toEqual([]);
  });

  it('drops rows with no usable timestamp rather than sorting them to the top', () => {
    const rows = waitingOnReply({
      inquiries: [
        { inquiry_id: 'ok', status: 'pending', created_at: ago(HOUR) },
        { inquiry_id: 'nulldate', status: 'pending', created_at: null },
        { inquiry_id: 'junk', status: 'pending', created_at: 'not-a-date' },
      ],
    });
    expect(rows.map((r) => r.id)).toEqual(['ok']);
  });

  it('carries the person and listing through for the card to render', () => {
    const [row] = waitingOnReply({
      inquiries: [
        {
          inquiry_id: 'i1',
          status: 'pending',
          created_at: ago(HOUR),
          student_name: 'Morne',
          listing_id: '0106001',
        },
      ],
    });
    expect(row).toMatchObject({ personName: 'Morne', listingId: '0106001', kind: 'inquiry' });
  });

  it('survives empty and nullish input', () => {
    expect(waitingOnReply()).toEqual([]);
    expect(waitingOnReply({ inquiries: null, bookings: null })).toEqual([]);
  });
});

describe('todayHeadline', () => {
  it('counts everyone waiting and formats the longest wait', () => {
    const rows = waitingOnReply({
      inquiries: [
        { inquiry_id: 'a', status: 'pending', created_at: ago(3 * DAY) },
        { inquiry_id: 'b', status: 'pending', created_at: ago(2 * HOUR) },
      ],
    });
    expect(todayHeadline(rows, { now: NOW })).toEqual({ count: 2, longestWait: '3d' });
  });

  it('reports nothing waiting as a real zero, not a null', () => {
    expect(todayHeadline([], { now: NOW })).toEqual({ count: 0, longestWait: null });
    expect(todayHeadline(null, { now: NOW })).toEqual({ count: 0, longestWait: null });
  });

  /*
    A row stamped in the future (clock skew between client and database) must
    not render "-2h waiting" in the largest text on the page.
  */
  it('clamps a future timestamp to zero rather than printing a negative', () => {
    const rows = [{ createdAt: NOW + 5 * HOUR }];
    expect(todayHeadline(rows, { now: NOW }).longestWait).toBe('<1m');
  });
});

describe('listingBlocker', () => {
  const live = { listing_status: 'active' };

  it('reports nothing for a listing that is already public', () => {
    expect(listingBlocker({ listing: live, isVerified: false })).toBeNull();
  });

  /*
    ID check is account-level, so it unblocks every listing at once. It has to
    outrank per-listing steps or a landlord with three drafts is told to submit
    three times before being told the one thing that gates all of them.
  */
  it('puts account-level ID verification ahead of per-listing steps', () => {
    const r = listingBlocker({
      listing: { flags: { listing_status: 'draft' } },
      isVerified: false,
    });
    expect(r).toEqual({ blocker: 'id_check', actionable: true });
  });

  it('asks for submission once the landlord is verified', () => {
    const r = listingBlocker({
      listing: { flags: { listing_status: 'draft' } },
      isVerified: true,
    });
    expect(r).toEqual({ blocker: 'submit', actionable: true });
  });

  it('asks for the video call once submitted', () => {
    const r = listingBlocker({
      listing: { flags: { listing_status: 'submitted' } },
      isVerified: true,
      propertyVerifications: [],
    });
    expect(r).toEqual({ blocker: 'video_call', actionable: true });
  });

  /*
    Admin review is the one state the landlord cannot act on. It still gets a
    card — silence is what makes a landlord email support to ask if they are
    stuck — but it must not be dressed up as a task.
  */
  it('marks admin review as not actionable', () => {
    const r = listingBlocker({
      listing: { flags: { listing_status: 'submitted' } },
      isVerified: true,
      propertyVerifications: [{ status: 'approved', verified_at: ago(DAY) }],
    });
    expect(r).toEqual({ blocker: 'admin_review', actionable: false });
  });

  /*
    propertyVerification.js is explicit: completion is `verified_at` being set,
    NOT `status` alone ("do not badge on status alone"). A row that is approved
    but not yet stamped must still read as an outstanding video call, or the
    landlord is told to wait for an admin who has nothing to approve.
  */
  it('does not treat an approved-but-unstamped verification as done', () => {
    const r = listingBlocker({
      listing: { flags: { listing_status: 'submitted' } },
      isVerified: true,
      propertyVerifications: [{ status: 'approved', verified_at: null }],
    });
    expect(r).toEqual({ blocker: 'video_call', actionable: true });
  });

  it('survives a null listing', () => {
    expect(listingBlocker({ listing: null, isVerified: true })).toBeNull();
  });
});

describe('liveReservations', () => {
  it('keeps only accepted and confirmed stays', () => {
    const rows = liveReservations([
      { booking_id: 'a', state: 'accepted', move_in: '2026-10-01' },
      { booking_id: 'b', state: 'confirmed', move_in: '2026-09-15' },
      { booking_id: 'c', state: 'expired', move_in: '2026-09-01' },
      { booking_id: 'd', state: 'requested', move_in: '2026-09-02' },
      { booking_id: 'e', state: 'cancelled', move_in: '2026-09-03' },
    ]);
    expect(rows.map((r) => r.booking_id)).toEqual(['b', 'a']);
  });

  it('does not mutate the input', () => {
    const input = [
      { booking_id: 'a', state: 'accepted', move_in: '2026-10-01' },
      { booking_id: 'b', state: 'accepted', move_in: '2026-09-01' },
    ];
    const before = input.map((b) => b.booking_id);
    liveReservations(input);
    expect(input.map((b) => b.booking_id)).toEqual(before);
  });

  /*
    The production database holds exactly one booking row and its state is
    `expired`. This is the case that actually renders today, and it must be an
    empty feed rather than a crash or a stray card.
  */
  it('returns nothing for the only booking that currently exists', () => {
    expect(liveReservations([{ booking_id: 'only', state: 'expired' }])).toEqual([]);
  });

  it('survives empty and nullish input', () => {
    expect(liveReservations(null)).toEqual([]);
    expect(liveReservations([])).toEqual([]);
  });
});

describe('waitingOnReply — waitedMs', () => {
  /*
    The clock is read inside the lib, not at the call site: the call site is a
    React render and the React Compiler rejects Date.now() there ("Cannot call
    impure function during render"). Reading it once also means every row on a
    screen is measured against the same instant instead of drifting row by row.
  */
  it('measures every row against one instant', () => {
    const rows = waitingOnReply(
      {
        inquiries: [
          { inquiry_id: 'a', status: 'pending', created_at: ago(2 * HOUR) },
          { inquiry_id: 'b', status: 'pending', created_at: ago(1 * HOUR) },
        ],
      },
      { now: NOW },
    );
    expect(rows.map((r) => r.waitedMs)).toEqual([2 * HOUR, 1 * HOUR]);
  });

  it('clamps a future timestamp to zero rather than a negative wait', () => {
    const [row] = waitingOnReply(
      { inquiries: [{ inquiry_id: 'skew', status: 'pending', created_at: new Date(NOW + HOUR).toISOString() }] },
      { now: NOW },
    );
    expect(row.waitedMs).toBe(0);
  });

  it('defaults to the real clock when no instant is supplied', () => {
    const [row] = waitingOnReply({
      inquiries: [{ inquiry_id: 'x', status: 'pending', created_at: new Date().toISOString() }],
    });
    expect(row.waitedMs).toBeGreaterThanOrEqual(0);
    expect(row.waitedMs).toBeLessThan(5000);
  });
});
