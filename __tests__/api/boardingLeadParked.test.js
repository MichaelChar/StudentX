import { describe, it, expect, vi } from 'vitest';

/*
  /api/boarding/lead while the boarding product is parked
  (src/lib/boardingParked.js). The middleware matcher skips /api, so this
  route is the only gate. It must answer before reading the body, opening a
  database client or sending mail — and must leave existing rows alone.
*/

const getSupabaseAsService = vi.fn(() => {
  throw new Error('parked endpoint must not open a database client');
});
vi.mock('@/lib/supabaseServer', () => ({ getSupabaseAsService: (...a) => getSupabaseAsService(...a) }));

const getResend = vi.fn(() => {
  throw new Error('parked endpoint must not send mail');
});
vi.mock('@/lib/resend', () => ({ getResend: (...a) => getResend(...a) }));

const { POST } = await import('@/app/api/boarding/lead/route');
const { BOARDING_ENABLED } = await import('@/lib/boardingParked');

describe('POST /api/boarding/lead (parked)', () => {
  it('is parked in this build', () => {
    // Fails on purpose once the product is switched back on: everything in
    // this file is about the parked state, so retire it together with the flag.
    expect(BOARDING_ENABLED).toBe(false);
  });

  it('answers 410 with the error shape the other routes use', async () => {
    const res = await POST(
      new Request('https://studentx.uk/api/boarding/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '3f6c1b2e-9a4d-4c1e-8f7a-1b2c3d4e5f60', event: 'view' }),
      }),
    );

    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error_code: 'GONE' });
    expect(getSupabaseAsService).not.toHaveBeenCalled();
    expect(getResend).not.toHaveBeenCalled();
  });

  it('does not even parse the body', async () => {
    const res = await POST(
      new Request('https://studentx.uk/api/boarding/lead', { method: 'POST', body: '{not json' }),
    );
    // A live route would answer 400 INVALID_INPUT here.
    expect(res.status).toBe(410);
  });
});
