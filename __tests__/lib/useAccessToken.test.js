import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveAccessToken } from '@/lib/useAccessToken';

/*
  Issue #521.

  The hook's async IIFE had no try/catch. gotrue serialises every auth call
  behind one Navigator lock, and boundedAuthLock caps ACQUISITION at 5s by
  THROWING on timeout — so a rejected getSession() meant setToken() was never
  called and the hook stayed at null. null is its "still resolving" value, so
  consumers waited forever on a promise that had already failed. That is what
  left the booking and reservation detail pages rendering their heading and
  nothing else, intermittently, under contention.

  The contract these pin: resolveAccessToken ALWAYS resolves to a string. It
  never rejects and never hangs.
*/

function client({ getSession, refreshSession } = {}) {
  return {
    auth: {
      getSession: getSession || vi.fn(async () => ({ data: { session: null } })),
      refreshSession: refreshSession || vi.fn(async () => ({ data: { session: null } })),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('resolveAccessToken (#521)', () => {
  it('returns the token when getSession succeeds', async () => {
    const c = client({ getSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-1' } } })) });
    await expect(resolveAccessToken(c)).resolves.toBe('tok-1');
  });

  it("returns '' when genuinely signed out", async () => {
    await expect(resolveAccessToken(client())).resolves.toBe('');
  });

  it('falls back to refreshSession when the cached session has no token', async () => {
    const c = client({
      refreshSession: vi.fn(async () => ({ data: { session: { access_token: 'tok-refreshed' } } })),
    });
    await expect(resolveAccessToken(c)).resolves.toBe('tok-refreshed');
    expect(c.auth.refreshSession).toHaveBeenCalledTimes(1);
  });

  it("RESOLVES to '' when getSession rejects — the #521 bug", async () => {
    // boundedAuthLock throws on acquire timeout. Before the fix this rejection
    // escaped and the hook never left null.
    const c = client({ getSession: vi.fn(async () => { throw new Error('lock acquire timeout'); }) });
    await expect(resolveAccessToken(c)).resolves.toBe('');
  });

  it("resolves to '' when refreshSession rejects too", async () => {
    const c = client({ refreshSession: vi.fn(async () => { throw new Error('network down'); }) });
    await expect(resolveAccessToken(c)).resolves.toBe('');
  });

  it('never rejects, whatever the client throws', async () => {
    const c = { auth: { getSession: () => { throw new Error('sync throw'); } } };
    await expect(resolveAccessToken(c)).resolves.toBe('');
  });

  it('tolerates a malformed response shape', async () => {
    const c = client({ getSession: vi.fn(async () => undefined) });
    await expect(resolveAccessToken(c)).resolves.toBe('');
  });

  it('RESOLVES rather than hanging when getSession never settles', async () => {
    // The case the lock-acquire bound does not cover: the lock is acquired,
    // then the work inside it stalls. Without the timeout race this promise
    // would never settle and the hook would sit at null indefinitely.
    const c = client({ getSession: vi.fn(() => new Promise(() => {})) });
    await expect(resolveAccessToken(c)).resolves.toBe('');
  }, 15_000);
});
