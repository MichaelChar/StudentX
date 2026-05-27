import { describe, it, expect, vi, afterEach } from 'vitest';
import { POST } from '@/app/api/log-client-error/route';

afterEach(() => vi.restoreAllMocks());

function makeReq(payload, { raw } = {}) {
  return new Request('https://test.local/api/log-client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw !== undefined ? raw : JSON.stringify(payload),
  });
}

describe('log-client-error route', () => {
  it('returns 204 and logs a known context + message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeReq({ context: 'signOut', message: 'boom' }));
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toContain('context=signOut');
    expect(spy.mock.calls[0][0]).toContain('boom');
  });

  it('coerces an unknown context to "unknown"', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeReq({ context: 'evil<script>', message: 'x' }));
    expect(res.status).toBe(204);
    expect(spy.mock.calls[0][0]).toContain('context=unknown');
  });

  it('clamps an overlong message to 500 chars', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await POST(makeReq({ context: 'login', message: 'a'.repeat(5000) }));
    const logged = spy.mock.calls[0][0];
    expect(logged.includes('a'.repeat(500))).toBe(true);
    expect(logged.includes('a'.repeat(501))).toBe(false);
  });

  it('returns 204 on invalid JSON without logging', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeReq(null, { raw: 'not json{' }));
    expect(res.status).toBe(204);
    expect(spy).not.toHaveBeenCalled();
  });
});
