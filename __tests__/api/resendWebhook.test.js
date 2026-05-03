import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the supabase service client so we can spy on upsert calls without
// hitting a real DB. The webhook route imports `createClient` directly from
// `@supabase/supabase-js`, so we mock that.
const mockUpsert = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ upsert: mockUpsert }),
  }),
}));

// Realistic-looking Svix webhook secret. The format Resend hands you is
// `whsec_<base64>` — the bytes after the prefix are the HMAC key.
const WEBHOOK_KEY_BYTES = new Uint8Array(32).fill(0x42);
const WEBHOOK_SECRET = `whsec_${btoa(String.fromCharCode(...WEBHOOK_KEY_BYTES))}`;

async function signSvix({ id, timestamp, body }) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    WEBHOOK_KEY_BYTES,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function makeRequest({ body, signedTimestamp, signature, idOverride }) {
  const id = idOverride || 'msg_test_123';
  const headers = new Headers({
    'svix-id': id,
    'svix-timestamp': String(signedTimestamp),
    'svix-signature': `v1,${signature}`,
    'content-type': 'application/json',
  });
  return new Request('http://localhost/api/webhooks/resend', {
    method: 'POST',
    headers,
    body,
  });
}

async function loadHandler() {
  // Re-import the route per test so module-scope env reads pick up changes.
  vi.resetModules();
  const mod = await import('@/app/api/webhooks/resend/route');
  return mod.POST;
}

describe('POST /api/webhooks/resend', () => {
  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    mockUpsert.mockReset();
    mockUpsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  it('rejects with 503 when RESEND_WEBHOOK_SECRET is unset', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const POST = await loadHandler();
    const res = await POST(
      new Request('http://localhost/api/webhooks/resend', {
        method: 'POST',
        body: '{}',
      }),
    );
    expect(res.status).toBe(503);
  });

  it('rejects with 401 when signature is missing', async () => {
    const POST = await loadHandler();
    const res = await POST(
      new Request('http://localhost/api/webhooks/resend', {
        method: 'POST',
        body: '{"type":"email.bounced"}',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when signature does not match', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ type: 'email.bounced', data: { to: ['x@y.com'] } });
    const req = makeRequest({ body, signedTimestamp: ts, signature: 'AAAA' });
    const POST = await loadHandler();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when timestamp is outside the replay window', async () => {
    const ts = Math.floor(Date.now() / 1000) - 60 * 60; // 1h old
    const body = JSON.stringify({ type: 'email.bounced', data: { to: ['x@y.com'] } });
    const sig = await signSvix({ id: 'msg_test_123', timestamp: ts, body });
    const req = makeRequest({ body, signedTimestamp: ts, signature: sig });
    const POST = await loadHandler();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('suppresses recipients on email.bounced', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: 'evt_abc',
        to: ['Bouncer@example.com', 'b@example.com'],
        bounce: { type: 'Permanent' },
      },
    });
    const sig = await signSvix({ id: 'msg_test_123', timestamp: ts, body });
    const req = makeRequest({ body, signedTimestamp: ts, signature: sig });

    const POST = await loadHandler();
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [rows, opts] = mockUpsert.mock.calls[0];
    expect(rows).toEqual([
      {
        email: 'bouncer@example.com', // normalized lowercase
        reason: 'bounced',
        bounce_type: 'Permanent',
        source_event_id: 'evt_abc',
      },
      {
        email: 'b@example.com',
        reason: 'bounced',
        bounce_type: 'Permanent',
        source_event_id: 'evt_abc',
      },
    ]);
    expect(opts).toEqual({ onConflict: 'email', ignoreDuplicates: true });
  });

  it('suppresses recipients on email.complained with reason="complained"', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      type: 'email.complained',
      data: { email_id: 'evt_xyz', to: ['c@example.com'] },
    });
    const sig = await signSvix({ id: 'msg_test_123', timestamp: ts, body });
    const req = makeRequest({ body, signedTimestamp: ts, signature: sig });

    const POST = await loadHandler();
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const [rows] = mockUpsert.mock.calls[0];
    expect(rows[0]).toEqual({
      email: 'c@example.com',
      reason: 'complained',
      bounce_type: null,
      source_event_id: 'evt_xyz',
    });
  });

  it('ignores non-bounce/complaint events without writing', async () => {
    const ts = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({
      type: 'email.delivered',
      data: { to: ['delivered@example.com'] },
    });
    const sig = await signSvix({ id: 'msg_test_123', timestamp: ts, body });
    const req = makeRequest({ body, signedTimestamp: ts, signature: sig });

    const POST = await loadHandler();
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ignored).toBe('email.delivered');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
