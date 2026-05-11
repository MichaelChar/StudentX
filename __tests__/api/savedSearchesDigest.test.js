import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Covers the frequency-selection logic added in PR #150 (consolidation of
// the daily and weekly saved-searches digest crons under a single trigger).
// The route now picks which frequencies to process from either the
// `?frequency=` query param (explicit override, used by manual curl and
// any legacy registration that still passes it) or, when unset, the
// current UTC day-of-week: daily every day, weekly also on Mondays.
//
// The branching itself is the entire new logic, so each test simply asserts
// which `frequency` filter values the route applied to the saved_searches
// query — that's the observable downstream of the decision. We short-circuit
// with an empty result so the test doesn't have to mock the Resend send /
// claim_digest_send paths, which are exercised by the route's existing
// integration callers, not by this branch logic.

const supabaseCalls = { frequencies: [] };

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (_table) => {
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          if (col === 'frequency') supabaseCalls.frequencies.push(val);
          return chain;
        },
        // The route awaits the chained query; this resolves it.
        then: (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
      };
      return chain;
    },
  }),
}));

vi.mock('@/lib/resend', () => ({
  getResend: () => ({ emails: { send: vi.fn() } }),
}));

vi.mock('@/lib/emailSuppressions', () => ({
  isEmailSuppressed: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/templates/email/digest', () => ({
  digestEmailHtml: () => '<html />',
  digestEmailSubject: () => 'subj',
}));

vi.mock('@/lib/transformListing', () => ({
  transformListing: (x) => x,
}));

const { POST } = await import('@/app/api/cron/saved-searches-digest/route');

const CRON_SECRET_VALUE = 'test-cron-secret';

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET_VALUE;
  supabaseCalls.frequencies = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function makeReq(query = '') {
  const url = `https://test.local/api/cron/saved-searches-digest${query ? `?${query}` : ''}`;
  return new Request(url, {
    method: 'POST',
    headers: { 'x-cron-secret': CRON_SECRET_VALUE },
  });
}

describe('saved-searches-digest frequency selection', () => {
  it('returns 401 when CRON_SECRET mismatches', async () => {
    const req = new Request('https://test.local/api/cron/saved-searches-digest', {
      method: 'POST',
      headers: { 'x-cron-secret': 'wrong' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('processes only weekly when ?frequency=weekly is set', async () => {
    const res = await POST(makeReq('frequency=weekly'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frequencies).toEqual(['weekly']);
    expect(supabaseCalls.frequencies).toEqual(['weekly']);
  });

  it('processes only daily when ?frequency=daily is set', async () => {
    const res = await POST(makeReq('frequency=daily'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frequencies).toEqual(['daily']);
    expect(supabaseCalls.frequencies).toEqual(['daily']);
  });

  it('processes only daily on a non-Monday with no query', async () => {
    vi.useFakeTimers();
    // 2026-05-12 is a Tuesday in UTC.
    vi.setSystemTime(new Date('2026-05-12T09:00:00Z'));
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frequencies).toEqual(['daily']);
    expect(supabaseCalls.frequencies).toEqual(['daily']);
  });

  it('processes both daily and weekly on a Monday with no query', async () => {
    vi.useFakeTimers();
    // 2026-05-11 is a Monday in UTC. The cron's actual fire time is
    // 09:00 UTC; pick a time well clear of the day boundary so the test
    // documents the intended firing window rather than the edge case.
    vi.setSystemTime(new Date('2026-05-11T09:00:00Z'));
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.frequencies).toEqual(['daily', 'weekly']);
    expect(supabaseCalls.frequencies).toEqual(['daily', 'weekly']);
  });

  it('aggregates zero processed/sent across both frequencies on a Monday', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T09:00:00Z'));
    const res = await POST(makeReq());
    const body = await res.json();
    expect(body).toMatchObject({
      processed: 0,
      emailsSent: 0,
      alreadyClaimed: 0,
      frequencies: ['daily', 'weekly'],
    });
  });
});
