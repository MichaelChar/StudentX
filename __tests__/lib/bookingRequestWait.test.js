import { describe, it, expect } from 'vitest';
import {
  URGENT_MS,
  requestExpiresAt,
  requestWait,
  requestWaitMessage,
} from '@/lib/bookingRequestWait';
import { EXPIRY_MS } from '@/lib/bookingState';

const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-09-03T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

const requested = (over = {}) => ({
  state: 'requested',
  last_activity_at: ago(HOUR),
  ...over,
});

describe('requestExpiresAt', () => {
  /*
    There is no `expires_at` column. Expiry is a ROLLING two days from
    last_activity_at, so it must be derived — a stored deadline would be
    simpler and would lie the moment either side touched the booking.
  */
  it('is last_activity_at plus the shared expiry window', () => {
    const b = requested({ last_activity_at: ago(0) });
    expect(requestExpiresAt(b)).toBe(NOW + EXPIRY_MS);
  });

  it('applies only to a requested booking', () => {
    for (const state of ['accepted', 'confirmed', 'declined', 'expired', 'cancelled']) {
      expect(requestExpiresAt(requested({ state }))).toBeNull();
    }
  });

  it('is null without a usable activity timestamp', () => {
    expect(requestExpiresAt(requested({ last_activity_at: null }))).toBeNull();
    expect(requestExpiresAt(requested({ last_activity_at: 'nonsense' }))).toBeNull();
    expect(requestExpiresAt(null)).toBeNull();
  });
});

describe('requestWait', () => {
  it('counts down from the derived deadline', () => {
    const w = requestWait(requested({ last_activity_at: ago(24 * HOUR) }), { now: NOW });
    expect(w.msLeft).toBe(24 * HOUR);
    expect(w.hoursLeft).toBe(24);
    expect(w.lapsed).toBe(false);
  });

  /*
    The cron sweeps expired requests on a schedule, so a student can load the
    page in the gap. It must read as "out of time", never as a negative
    countdown.
  */
  it('clamps a lapsed request at zero rather than going negative', () => {
    const w = requestWait(requested({ last_activity_at: ago(EXPIRY_MS + 5 * HOUR) }), { now: NOW });
    expect(w.msLeft).toBe(0);
    expect(w.lapsed).toBe(true);
    expect(w.hoursLeft).toBe(0);
  });

  /*
    Rounded UP: with 90 minutes left, "2 hours" is both kinder and more
    accurate than "1 hour", which reads as almost gone.
  */
  it('rounds the hour count up', () => {
    const w = requestWait(requested({ last_activity_at: ago(EXPIRY_MS - 90 * 60 * 1000) }), { now: NOW });
    expect(w.hoursLeft).toBe(2);
  });

  it('marks the last stretch urgent', () => {
    const soon = requestWait(requested({ last_activity_at: ago(EXPIRY_MS - 6 * HOUR) }), { now: NOW });
    expect(soon.urgent).toBe(true);

    const plenty = requestWait(requested({ last_activity_at: ago(HOUR) }), { now: NOW });
    expect(plenty.urgent).toBe(false);
  });

  it('does not call a lapsed request urgent — it is past urgency', () => {
    const w = requestWait(requested({ last_activity_at: ago(EXPIRY_MS * 2) }), { now: NOW });
    expect(w.urgent).toBe(false);
    expect(w.lapsed).toBe(true);
  });

  it('is null for anything without a deadline', () => {
    expect(requestWait(requested({ state: 'accepted' }), { now: NOW })).toBeNull();
    expect(requestWait(null, { now: NOW })).toBeNull();
  });

  /*
    The window rolls: a landlord viewing or messaging resets last_activity_at,
    so the student's countdown can legitimately go UP. Surprising, and correct.
  */
  it('resets when activity moves the window forward', () => {
    const stale = requestWait(requested({ last_activity_at: ago(40 * HOUR) }), { now: NOW });
    const touched = requestWait(requested({ last_activity_at: ago(HOUR) }), { now: NOW });
    expect(touched.msLeft).toBeGreaterThan(stale.msLeft);
  });
});

describe('requestWaitMessage', () => {
  /*
    Three shapes, not one string with a number in it. "2 days to reply" is
    reassurance, "6 hours left" is a prompt, and "out of time" is neither.
    Different messages, not one message with a variable.
  */
  it('reassures in days while there is plenty of time', () => {
    const m = requestWaitMessage(requested({ last_activity_at: ago(HOUR) }), { now: NOW });
    expect(m).toEqual({ key: 'waitDays', params: { days: 2 } });
  });

  it('switches to hours inside the final stretch', () => {
    const m = requestWaitMessage(
      requested({ last_activity_at: ago(EXPIRY_MS - 6 * HOUR) }),
      { now: NOW },
    );
    expect(m.key).toBe('waitHours');
    expect(m.params.hours).toBe(6);
  });

  it('uses hours rather than "1 day" for the last day', () => {
    const m = requestWaitMessage(
      requested({ last_activity_at: ago(EXPIRY_MS - 20 * HOUR) }),
      { now: NOW },
    );
    expect(m.key).toBe('waitHours');
  });

  it('says out of time once lapsed', () => {
    const m = requestWaitMessage(
      requested({ last_activity_at: ago(EXPIRY_MS + HOUR) }),
      { now: NOW },
    );
    expect(m).toEqual({ key: 'waitLapsed', params: {} });
  });

  it('is null when there is nothing to say', () => {
    expect(requestWaitMessage(requested({ state: 'confirmed' }), { now: NOW })).toBeNull();
  });

  it('returns keys, never rendered copy', () => {
    const m = requestWaitMessage(requested(), { now: NOW });
    expect(m.key).toMatch(/^wait/);
  });
});

describe('the urgency threshold', () => {
  it('is half a day, matching the reminder cadence', () => {
    expect(URGENT_MS).toBe(12 * 60 * 60 * 1000);
    expect(URGENT_MS).toBeLessThan(EXPIRY_MS);
  });
});
