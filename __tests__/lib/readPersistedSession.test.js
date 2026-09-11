import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readPersistedSession } from '@/lib/supabaseBrowser';

/*
  Issue #521. getSession() takes gotrue's auth lock, and we reproduced a
  holder that never releases it — so the READ path is bypassed and the token
  is taken straight from storage instead.

  That means depending on supabase's storage format, which can change
  silently on upgrade. These pin the contract that matters: anything the
  reader is not certain about returns null, so the caller falls back to
  getSession() and we degrade to the old behaviour rather than breaking auth
  or, worse, handing out a stale token.
*/

const URL_ = 'https://ecluqurlfbvkxrnoyhaq.supabase.co';
const KEY = 'sb-ecluqurlfbvkxrnoyhaq-auth-token';
const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 10;

let store;
beforeEach(() => {
  store = new Map();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
    },
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const put = (v) => store.set(KEY, typeof v === 'string' ? v : JSON.stringify(v));

describe('readPersistedSession (#521)', () => {
  it('returns the token from a valid unexpired session', () => {
    put({ access_token: 'tok-1', expires_at: future() });
    expect(readPersistedSession()).toBe('tok-1');
  });

  it('returns null when nothing is stored', () => {
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null for an EXPIRED token rather than handing it out', () => {
    // Returning it would swap a visible hang for silent 401s — worse.
    put({ access_token: 'tok-old', expires_at: past() });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null inside the expiry skew, so we never serve a token about to die', () => {
    put({ access_token: 'tok-edge', expires_at: Math.floor(Date.now() / 1000) + 30 });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null when expires_at is missing — no expiry means not trustworthy', () => {
    put({ access_token: 'tok-noexp' });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null when expires_at is not a number (format drift)', () => {
    put({ access_token: 'tok', expires_at: '1789000000' });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null on unparseable JSON', () => {
    put('{not json');
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null when the shape changes entirely', () => {
    // e.g. supabase nests the session one level deeper in a future version.
    put({ session: { access_token: 'tok', expires_at: future() } });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null for an empty token string', () => {
    put({ access_token: '', expires_at: future() });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null without a configured Supabase URL', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    put({ access_token: 'tok', expires_at: future() });
    expect(readPersistedSession()).toBeNull();
  });

  it('returns null server-side, where there is no window', () => {
    vi.unstubAllGlobals();
    expect(readPersistedSession()).toBeNull();
  });

  it('derives the storage key from the project ref, not a hardcoded value', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://otherproj.supabase.co';
    put({ access_token: 'tok-1', expires_at: future() });
    // Stored under the OLD ref's key, so the new ref must not find it.
    expect(readPersistedSession()).toBeNull();
    store.set('sb-otherproj-auth-token', JSON.stringify({ access_token: 'tok-2', expires_at: future() }));
    expect(readPersistedSession()).toBe('tok-2');
  });
});
