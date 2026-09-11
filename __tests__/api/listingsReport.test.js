import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Issue #219. /api/listings/report is unauthenticated and emails ops on
  every accepted call. Its only throttle was a module-level Map, which on
  Cloudflare Workers lives in an ephemeral per-colo isolate — so it was
  never global and never durable. These tests cover the durable layer
  (migration 118's check_listing_report_rate_limit) and, importantly, the
  fail-open behaviour, which is a deliberate choice rather than an
  accident and would otherwise be easy to "fix" the wrong way later.

  The route had no tests at all before this.
*/

const rpc = vi.fn(async () => ({ data: 'ok', error: null }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ rpc }) }));

const send = vi.fn(async () => ({ id: 'email-1' }));
vi.mock('@/lib/resend', () => ({ getResend: () => ({ emails: { send } }) }));

const { POST } = await import('@/app/api/listings/report/route');

// A fresh IP per test keeps the in-process layer-1 Map (module state that
// persists across cases in one file) from masking what layer 2 does.
let ipCounter = 0;
function req(body, ip) {
  return new Request('https://studentx.uk/api/listings/report', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': ip ?? `203.0.113.${++ipCounter}`,
    },
    body: JSON.stringify(body),
  });
}

const VALID = { listingId: '1234567', reason: 'scam_fraud', note: 'looks fake' };

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: 'ok', error: null });
  process.env.SYNTHETIC_ALERT_EMAIL = 'ops@example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

describe('POST /api/listings/report — durable rate limit (#219)', () => {
  it('sends the email and records the hit when the RPC says ok', async () => {
    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    // A listing report is ops mail — read while triaging abuse, so the sender
    // stays plain and scannable rather than personalised.
    expect(send.mock.calls[0][0].from).toBe('StudentX <alerts@studentx.uk>');
    expect(rpc).toHaveBeenCalledWith(
      'check_listing_report_rate_limit',
      expect.objectContaining({ p_listing_id: '1234567' }),
    );
  });

  it('never passes the raw IP to the database', async () => {
    const ip = '198.51.100.7';
    await POST(req(VALID, ip));

    const { p_ip_hash: hash } = rpc.mock.calls[0][1];
    expect(hash).not.toContain(ip);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('429s without emailing when the RPC says rate_limited', async () => {
    rpc.mockResolvedValue({ data: 'rate_limited', error: null });

    const res = await POST(req(VALID));

    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error_code: 'RATE_LIMITED' });
    expect(send).not.toHaveBeenCalled();
  });

  it('200s WITHOUT emailing on a duplicate — not 429', async () => {
    // Ops learn nothing from the second copy, and the reporter should not
    // be told their earlier report failed, nor punished for reporting a
    // genuine problem twice.
    rpc.mockResolvedValue({ data: 'duplicate', error: null });

    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(send).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the database is unreachable', async () => {
    // Deliberate: a silently-dropped abuse report is worse than a flood
    // during an outage, and layer 1 still caps the easy case. Pinned so
    // this is not "corrected" into fail-closed without a decision.
    rpc.mockRejectedValue(new Error('connection refused'));

    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a bad listingId before touching the limiter', async () => {
    const res = await POST(req({ ...VALID, listingId: 'abc' }));

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects an off-list reason before touching the limiter', async () => {
    const res = await POST(req({ ...VALID, reason: 'because' }));

    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
