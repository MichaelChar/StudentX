import { describe, it, expect } from 'vitest';
import {
  canTransition,
  blockActionForTransition,
  planTransition,
  planOfflineAccept,
  applyBlockAction,
  hasBlockingOverlap,
  isExpiredByInactivity,
  isDueReminder,
  EXPIRY_MS,
  REMINDER_MS,
} from '@/lib/bookingState';

const stay = {
  listing_id: '0100001',
  move_in: '2026-09-01',
  move_out: '2026-12-01',
};

function booking(overrides = {}) {
  return {
    booking_id: 'b-1',
    listing_id: stay.listing_id,
    move_in: stay.move_in,
    move_out: stay.move_out,
    state: 'requested',
    last_activity_at: new Date('2026-08-01T12:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('booking state machine transitions', () => {
  it('allows the happy path requested → accepted → confirmed', () => {
    expect(canTransition('requested', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'confirmed')).toBe(true);
    expect(canTransition('requested', 'confirmed')).toBe(false);
  });

  it('allows terminal exits from requested', () => {
    expect(canTransition('requested', 'declined')).toBe(true);
    expect(canTransition('requested', 'expired')).toBe(true);
    expect(canTransition('requested', 'cancelled')).toBe(true);
  });

  it('forbids transitions out of terminal states', () => {
    for (const s of ['declined', 'expired', 'cancelled', 'disputed']) {
      expect(canTransition(s, 'requested')).toBe(false);
      expect(canTransition(s, 'accepted')).toBe(false);
    }
  });
});

describe('availability block actions — every terminal path releases pending', () => {
  it('inserts pending on create (null → requested)', () => {
    expect(blockActionForTransition(null, 'requested')).toEqual({
      action: 'insert_pending',
    });
  });

  it('converts pending → booked on accept', () => {
    expect(blockActionForTransition('requested', 'accepted')).toEqual({
      action: 'pending_to_booked',
    });
  });

  it('releases pending on decline', () => {
    const plan = planTransition({
      booking: booking(),
      toState: 'declined',
      actor: 'landlord',
    });
    expect(plan.error).toBeUndefined();
    expect(plan.blockAction).toEqual({ action: 'release_pending' });

    let blocks = applyBlockAction([], { action: 'insert_pending' }, stay);
    expect(hasBlockingOverlap(blocks, stay.listing_id, stay.move_in, stay.move_out)).toBe(
      true,
    );
    blocks = applyBlockAction(blocks, plan.blockAction, stay);
    expect(hasBlockingOverlap(blocks, stay.listing_id, stay.move_in, stay.move_out)).toBe(
      false,
    );
  });

  it('releases pending on expire', () => {
    const plan = planTransition({
      booking: booking(),
      toState: 'expired',
      actor: 'system',
    });
    expect(plan.blockAction).toEqual({ action: 'release_pending' });

    let blocks = applyBlockAction([], { action: 'insert_pending' }, stay);
    blocks = applyBlockAction(blocks, plan.blockAction, stay);
    expect(blocks.filter((b) => b.kind === 'pending')).toHaveLength(0);
  });

  it('releases pending on cancel while requested', () => {
    const plan = planTransition({
      booking: booking(),
      toState: 'cancelled',
      actor: 'student',
    });
    expect(plan.blockAction).toEqual({ action: 'release_pending' });

    let blocks = applyBlockAction([], { action: 'insert_pending' }, stay);
    blocks = applyBlockAction(blocks, plan.blockAction, stay);
    expect(hasBlockingOverlap(blocks, stay.listing_id, stay.move_in, stay.move_out)).toBe(
      false,
    );
  });

  it('releases booked on cancel after accept/confirm', () => {
    let blocks = applyBlockAction([], { action: 'insert_pending' }, stay);
    blocks = applyBlockAction(blocks, { action: 'pending_to_booked' }, stay);
    expect(blocks.some((b) => b.kind === 'booked')).toBe(true);

    const plan = planTransition({
      booking: booking({ state: 'confirmed' }),
      toState: 'cancelled',
      actor: 'landlord',
    });
    expect(plan.blockAction).toEqual({ action: 'release_booked' });
    blocks = applyBlockAction(blocks, plan.blockAction, stay);
    expect(hasBlockingOverlap(blocks, stay.listing_id, stay.move_in, stay.move_out)).toBe(
      false,
    );
  });

  it('offline accept converts pending → booked and ends in confirmed', () => {
    const plan = planOfflineAccept({ booking: booking() });
    expect(plan.error).toBeUndefined();
    expect(plan.finalState).toBe('confirmed');
    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].blockAction).toEqual({ action: 'pending_to_booked' });
    expect(plan.steps[1].blockAction).toEqual({ action: 'none' });

    let blocks = applyBlockAction([], { action: 'insert_pending' }, stay);
    blocks = applyBlockAction(blocks, plan.steps[0].blockAction, stay);
    expect(blocks.some((b) => b.kind === 'booked')).toBe(true);
    expect(blocks.some((b) => b.kind === 'pending')).toBe(false);
  });
});

describe('rolling inactivity timers', () => {
  it('expires after 2 days of inactivity on requested', () => {
    const last = new Date('2026-08-01T00:00:00Z');
    const now = new Date(last.getTime() + EXPIRY_MS);
    expect(
      isExpiredByInactivity(
        booking({ last_activity_at: last.toISOString() }),
        now,
      ),
    ).toBe(true);
    expect(
      isExpiredByInactivity(
        booking({ last_activity_at: last.toISOString() }),
        new Date(last.getTime() + EXPIRY_MS - 1),
      ),
    ).toBe(false);
  });

  it('is due for a 24h reminder inside the expiry window', () => {
    const last = new Date('2026-08-01T00:00:00Z');
    const at24h = new Date(last.getTime() + REMINDER_MS);
    expect(
      isDueReminder(booking({ last_activity_at: last.toISOString() }), at24h),
    ).toBe(true);
    // After expiry threshold, reminder job should not claim it.
    const atExpiry = new Date(last.getTime() + EXPIRY_MS);
    expect(
      isDueReminder(booking({ last_activity_at: last.toISOString() }), atExpiry),
    ).toBe(false);
  });

  it('does not expire non-requested states', () => {
    const last = new Date('2026-08-01T00:00:00Z');
    const now = new Date(last.getTime() + EXPIRY_MS * 3);
    expect(
      isExpiredByInactivity(
        booking({ state: 'confirmed', last_activity_at: last.toISOString() }),
        now,
      ),
    ).toBe(false);
  });
});

describe('overlap detection', () => {
  it('detects overlapping pending/booked holds', () => {
    const blocks = [
      {
        listing_id: '0100001',
        start_date: '2026-09-15',
        end_date: '2026-10-15',
        kind: 'pending',
      },
    ];
    expect(hasBlockingOverlap(blocks, '0100001', '2026-09-01', '2026-12-01')).toBe(
      true,
    );
    expect(hasBlockingOverlap(blocks, '0100001', '2026-11-01', '2026-12-01')).toBe(
      false,
    );
    expect(hasBlockingOverlap(blocks, '0100002', '2026-09-01', '2026-12-01')).toBe(
      false,
    );
  });
});
