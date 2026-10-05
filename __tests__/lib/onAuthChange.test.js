import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GoTrueClient } from '@supabase/auth-js';
import { onAuthChange } from '@/lib/onAuthChange';

// The REAL gotrue client, not a mock: the bug is in how gotrue's lock and its
// listener notification interact, so only the real thing can reproduce it.
// Network is a stub: /logout answers 204, a refresh-token grant answers a
// fresh session.
function signedInClient() {
  const store = new Map();
  const storageKey = 'sb-test-auth-token';
  const now = Math.floor(Date.now() / 1000);
  const user = { id: 'u1', aud: 'authenticated', email: 'x@example.com' };
  store.set(
    storageKey,
    JSON.stringify({
      access_token: 'a.b.c',
      refresh_token: 'r',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user,
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
    fetch: async (url) =>
      String(url).includes('grant_type=refresh_token')
        ? new Response(
            JSON.stringify({
              access_token: 'd.e.f',
              refresh_token: 'r2',
              token_type: 'bearer',
              expires_in: 3600,
              expires_at: now + 7200,
              user,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        : new Response(null, { status: 204 }),
  });
  // supabase-js exposes the gotrue client as `.auth`; onAuthChange takes that shape.
  return { client, supabase: { auth: client } };
}

// Navbar's refresh(): awaits getSession() under a timeout (15 s in the app).
// The stall it causes equals this timeout, so the bug tests assert a lower
// bound near it and the fix tests an upper bound well under it — wide enough
// apart that a slow CI runner cannot blur the two.
const LISTENER_TIMEOUT_MS = 1000;
const refreshLike = (client) =>
  Promise.race([
    client.getSession(),
    new Promise((resolve) => setTimeout(resolve, LISTENER_TIMEOUT_MS)),
  ]);

// Let the subscription's own INITIAL_SESSION delivery finish before timing
// anything, so each test measures the operation it names.
async function settle(client) {
  await new Promise((resolve) => setTimeout(resolve, 20));
  await client.getSession();
}

async function timed(fn) {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
}

// If a bug test starts failing after a supabase-js upgrade, gotrue stopped
// awaiting listeners inside its lock — good news, not a regression; the
// onAuthChange wrapper then becomes optional.
const NO_LONGER_DEADLOCKS = 'gotrue no longer deadlocks on inline listeners — see comment above';

describe('auth listeners and the gotrue lock', () => {
  it('REPRODUCES THE BUG: an inline listener that awaits getSession() stalls signOut until it times out', async () => {
    const { client } = signedInClient();
    await client.initialize();
    client.onAuthStateChange(() => refreshLike(client));
    await settle(client);

    // signOut holds the lock while it awaits the listener; the listener's
    // getSession queues behind that same lock. Only the timeout breaks it.
    expect(await timed(() => client.signOut()), NO_LONGER_DEADLOCKS).toBeGreaterThanOrEqual(
      LISTENER_TIMEOUT_MS - 50,
    );
  });

  it('REPRODUCES THE BUG: …and stalls a token refresh the same way', async () => {
    const { client } = signedInClient();
    await client.initialize();
    client.onAuthStateChange(() => refreshLike(client));
    await settle(client);

    expect(await timed(() => client.refreshSession()), NO_LONGER_DEADLOCKS).toBeGreaterThanOrEqual(
      LISTENER_TIMEOUT_MS - 50,
    );
  });

  it('onAuthChange: signOut releases the lock at once, and the handler still sees SIGNED_OUT', async () => {
    const { client, supabase } = signedInClient();
    await client.initialize();
    let resolveSignedOut;
    const signedOut = new Promise((r) => {
      resolveSignedOut = r;
    });
    onAuthChange(supabase, async (event) => {
      // The same lock-taking work Navbar does — now harmless. No timeout
      // here on purpose: if this deadlocked, the test would hang and fail.
      const { data } = await client.getSession();
      if (event === 'SIGNED_OUT') resolveSignedOut(data.session);
    });
    await settle(client);

    expect(await timed(() => client.signOut())).toBeLessThan(LISTENER_TIMEOUT_MS / 2);
    expect(await signedOut).toBeNull();
  });

  it('onAuthChange: a token refresh releases the lock at once', async () => {
    const { client, supabase } = signedInClient();
    await client.initialize();
    const events = [];
    onAuthChange(supabase, async (event) => {
      events.push(event);
      await client.getSession();
    });
    await settle(client);

    expect(await timed(() => client.refreshSession())).toBeLessThan(LISTENER_TIMEOUT_MS / 2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(events).toContain('TOKEN_REFRESHED');
  });

  it('onAuthChange: a handler still queued at unsubscribe does not run', async () => {
    const { client, supabase } = signedInClient();
    await client.initialize();
    const events = [];
    const { data } = onAuthChange(supabase, (event) => events.push(event));
    await settle(client);
    events.length = 0;

    // signOut notifies (queuing the deferred handler); unsubscribe before the
    // next tick, as a component unmounting in the same turn would.
    await client.signOut();
    data.subscription.unsubscribe();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(events).toEqual([]);
  });
});

// --- Guard -----------------------------------------------------------------
// Every direct supabase.auth.onAuthStateChange listener in src/ must not hand
// gotrue a promise or await anything: gotrue awaits whatever the callback
// returns while holding its auth lock. That is what keeps the existing ones
// (useAccessToken, useAuthEmail, SessionSync, the reset-password pages) safe.
// Anything that needs to await supabase.auth goes through onAuthChange.
// Syntactic on purpose — it catches the shapes that bite (async callbacks,
// expression bodies, `return refresh()`, `await` in the body), not every
// possible way to block.

const srcDir = join(process.cwd(), 'src');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.jsx?$/.test(entry) ? [full] : [];
  });
}

// The text between `onAuthStateChange(` and its matching `)`.
function callArgument(code, openParen) {
  let depth = 0;
  for (let i = openParen; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') {
      depth -= 1;
      if (depth === 0) return code.slice(openParen + 1, i);
    }
  }
  return code.slice(openParen + 1);
}

// Strip comments so prose that quotes a bad pattern is not flagged.
const stripComments = (code) => code.replace(/\/\*[^]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const sites = walk(srcDir)
  .filter((file) => !file.endsWith(join('lib', 'onAuthChange.js')))
  .flatMap((file) => {
    const code = stripComments(readFileSync(file, 'utf8'));
    const found = [];
    const re = /\.onAuthStateChange\(/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      const arg = callArgument(code, m.index + m[0].length - 1).trim();
      found.push({ where: relative(process.cwd(), file), arg });
    }
    return found;
  });

function problemsWith(arg) {
  const problems = [];
  if (/^async\b/.test(arg)) problems.push('async callback');
  const arrow = arg.match(/^(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*([^]*)$/);
  const fn = arg.match(/^function\b[^{]*\{([^]*)\}$/);
  let body;
  if (arrow) {
    if (!arrow[1].startsWith('{')) problems.push('expression-bodied arrow returns its value to gotrue');
    body = arrow[1];
  } else if (fn) {
    body = fn[1];
  } else {
    problems.push('callback is not an inline function — cannot check it; use onAuthChange()');
    body = '';
  }
  if (/\breturn\s+[^;\n]*\(/.test(body)) problems.push('returns a call result to gotrue');
  if (/\bawait\b/.test(body)) problems.push('awaits inside the callback');
  return problems;
}

describe('onAuthStateChange listeners in src/', () => {
  it('finds the known listeners (the scan is not silently blind)', () => {
    const where = sites.map((s) => s.where);
    for (const known of [
      join('src', 'lib', 'useAccessToken.js'),
      join('src', 'lib', 'useAuthEmail.js'),
      join('src', 'components', 'SessionSync.js'),
    ]) {
      expect(where).toContain(known);
    }
  });

  it('flags the shapes that deadlock', () => {
    expect(problemsWith('() => refresh()')).not.toEqual([]);
    expect(problemsWith('async (e) => { await refresh(); }')).not.toEqual([]);
    expect(problemsWith('() => { return refresh(); }')).not.toEqual([]);
    expect(problemsWith('function (e) { return refresh(e); }')).not.toEqual([]);
    expect(problemsWith('handleChange')).not.toEqual([]);
    expect(problemsWith('(event, session) => { if (session) setToken(session.access_token); }')).toEqual([]);
  });

  it.each(sites.map((s) => [s.where, s.arg]))('%s: callback cannot hold the auth lock', (_where, arg) => {
    expect(problemsWith(arg)).toEqual([]);
  });
});
