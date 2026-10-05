import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GoTrueClient } from '@supabase/auth-js';
import { onAuthChange } from '@/lib/onAuthChange';

// The REAL gotrue client, not a mock: the bug is in how gotrue's lock and its
// listener notification interact, so only the real thing can reproduce it.
// Network is a stub that answers /logout with 204.
function signedInClient() {
  const store = new Map();
  const storageKey = 'sb-test-auth-token';
  const now = Math.floor(Date.now() / 1000);
  store.set(
    storageKey,
    JSON.stringify({
      access_token: 'a.b.c',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user: { id: 'u1', aud: 'authenticated', email: 'x@example.com' },
    }),
  );
  const client = new GoTrueClient({
    url: 'http://auth.test',
    storageKey,
    storage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    },
    autoRefreshToken: false,
    persistSession: true,
    detectSessionInUrl: false,
    fetch: async () => new Response(null, { status: 204 }),
  });
  // supabase-js exposes the gotrue client as `.auth`; onAuthChange takes that shape.
  return { client, supabase: { auth: client } };
}

// Navbar's refresh(): awaits getSession() under a timeout. Navbar's is 15 s;
// 300 ms keeps the test quick while still measuring the stall.
const LISTENER_TIMEOUT_MS = 300;
const refreshLike = (client) =>
  Promise.race([
    client.getSession(),
    new Promise((resolve) => setTimeout(resolve, LISTENER_TIMEOUT_MS)),
  ]);

async function timeSignOut(client) {
  const t0 = performance.now();
  await client.signOut();
  return performance.now() - t0;
}

describe('auth listeners and the gotrue lock', () => {
  it('REPRODUCES THE BUG: an inline listener that awaits getSession() stalls signOut until it times out', async () => {
    const { client } = signedInClient();
    await client.initialize();
    client.onAuthStateChange(() => refreshLike(client));

    // signOut holds the lock while it awaits the listener; the listener's
    // getSession queues behind that same lock. Only the timeout breaks it.
    // If this starts failing after a supabase-js upgrade, gotrue stopped
    // awaiting listeners inside its lock — good news, not a regression; the
    // onAuthChange wrapper then becomes optional.
    expect(
      await timeSignOut(client),
      'gotrue no longer deadlocks on inline listeners — see comment above',
    ).toBeGreaterThanOrEqual(LISTENER_TIMEOUT_MS - 20);
  });

  it('onAuthChange defers the handler, so signOut releases the lock at once', async () => {
    const { client, supabase } = signedInClient();
    await client.initialize();
    const events = [];
    let resolveSignedOut;
    const signedOut = new Promise((r) => {
      resolveSignedOut = r;
    });
    onAuthChange(supabase, async (event) => {
      events.push(event);
      // The same lock-taking work Navbar does — now harmless.
      const { data } = await client.getSession();
      if (event === 'SIGNED_OUT') resolveSignedOut(data.session);
    });

    expect(await timeSignOut(client)).toBeLessThan(LISTENER_TIMEOUT_MS / 2);
    // …and the handler still runs, after the lock is free, and sees the
    // signed-out state.
    expect(await signedOut).toBeNull();
    expect(events).toContain('SIGNED_OUT');
  });

  it('returns the onAuthStateChange subscription, so callers can unsubscribe', async () => {
    const { client, supabase } = signedInClient();
    await client.initialize();
    const { data } = onAuthChange(supabase, () => {});
    expect(typeof data.subscription.unsubscribe).toBe('function');
    data.subscription.unsubscribe();
  });
});

// --- Guard -----------------------------------------------------------------
// Every direct supabase.auth.onAuthStateChange listener in src/ must have a
// synchronous, block-bodied callback. That is what keeps the existing ones
// (useAccessToken, useAuthEmail, SessionSync, the reset-password pages) safe:
// gotrue awaits whatever the callback returns, so an `async` callback or an
// expression body returning a promise (`() => refresh()`) can hold the auth
// lock. Anything that needs to await supabase.auth goes through onAuthChange.
// Cheap and syntactic on purpose — it catches the shape that bit us, not
// every possible way to block inside a block body.

const srcDir = join(process.cwd(), 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx?$/.test(entry) ? [full] : [];
  });
}

describe('onAuthStateChange listeners in src/', () => {
  const sites = walk(srcDir)
    .filter((file) => !file.endsWith(join('lib', 'onAuthChange.js')))
    .flatMap((file) => {
      const code = readFileSync(file, 'utf8');
      const re = /\.onAuthStateChange\(\s*([^]*?=>\s*\S)/g;
      const found = [];
      let m;
      while ((m = re.exec(code)) !== null) {
        found.push({ where: relative(process.cwd(), file), head: m[1] });
      }
      return found;
    });

  it('finds the listeners (the scan is not silently empty)', () => {
    expect(sites.length).toBeGreaterThan(0);
  });

  it.each(sites.map((s) => [s.where, s.head]))(
    '%s: callback is synchronous and block-bodied',
    (_where, head) => {
      expect(head, 'async callback — gotrue awaits it inside its auth lock').not.toMatch(/^async\b/);
      expect(head, 'expression-bodied callback returns its value to gotrue; use a { } body or onAuthChange()').toMatch(/=>\s*\{$/);
    },
  );
});
