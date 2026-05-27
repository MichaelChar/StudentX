import { describe, it, expect, vi, afterEach } from 'vitest';
import { withTimeout } from '@/lib/withTimeout';
import { signOutSafely } from '@/lib/authHelpers';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('withTimeout', () => {
  it('resolves with the underlying value when it settles in time', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
  });

  it('propagates the underlying rejection when it settles in time', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
  });

  it('rejects after the timeout when the promise never settles', async () => {
    vi.useFakeTimers();
    const assertion = expect(withTimeout(new Promise(() => {}), 5000)).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});

describe('signOutSafely', () => {
  it('calls supabase.auth.signOut()', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await signOutSafely({ auth: { signOut } });
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('swallows a rejected signOut instead of throwing', async () => {
    const signOut = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(signOutSafely({ auth: { signOut } })).resolves.toBeUndefined();
  });

  it('resolves (does not hang) when signOut never settles', async () => {
    vi.useFakeTimers();
    const signOut = vi.fn(() => new Promise(() => {}));
    const result = signOutSafely({ auth: { signOut } }, { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(result).resolves.toBeUndefined();
  });
});
