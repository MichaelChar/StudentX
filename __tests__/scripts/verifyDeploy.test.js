import { describe, it, expect } from 'vitest';
import {
  shaMatches,
  extractStaticAssets,
  request,
  waitForSha,
  watchStable,
  runSmokeChecks,
} from '../../scripts/verify-deploy.mjs';

const SHA = '09b72e0de7ea56f9ce440e286078717a18294127';
const OLD = 'c1bb534f0000000000000000000000000000beef';
const BASE = 'https://studentx.uk';
const noSleep = async () => {};

function res(status, body = '') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status,
    text: async () => text,
    json: async () => JSON.parse(text),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

// A clock that advances by each sleep, so timeouts run instantly.
function fakeClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

function versionFetch(shas) {
  let i = 0;
  return async (url) => {
    if (!url.includes('/version.json')) throw new Error(`unexpected ${url}`);
    const sha = shas[Math.min(i++, shas.length - 1)];
    return sha ? res(200, { sha }) : res(404, 'not found');
  };
}

describe('shaMatches', () => {
  it('matches full and abbreviated SHAs either way round', () => {
    expect(shaMatches(SHA, SHA)).toBe(true);
    expect(shaMatches(SHA, '09b72e0')).toBe(true);
    expect(shaMatches('09B72E0', SHA)).toBe(true);
  });

  it('rejects different, missing, or too-short stamps', () => {
    expect(shaMatches(OLD, SHA)).toBe(false);
    expect(shaMatches(null, SHA)).toBe(false);
    expect(shaMatches('unknown', SHA)).toBe(false);
    expect(shaMatches('09b', SHA)).toBe(false);
  });
});

describe('extractStaticAssets', () => {
  it('collects script and stylesheet chunks once each, decoding &amp;', () => {
    const html = `
      <link rel="stylesheet" href="/_next/static/chunks/a.css?dpl=x&amp;v=1"/>
      <script src="/_next/static/chunks/b.js" async></script>
      <script src="/_next/static/chunks/b.js" async></script>
      <link rel="preload" href="/_next/static/media/font.woff2" as="font"/>
      <img src="/_next/image?url=x"/>
      <a href="/property">x</a>`;
    expect(extractStaticAssets(html)).toEqual([
      '/_next/static/chunks/a.css?dpl=x&v=1',
      '/_next/static/chunks/b.js',
      '/_next/static/media/font.woff2',
    ]);
  });
});

describe('request', () => {
  it('retries Cloudflare edge errors, then returns the real answer', async () => {
    const statuses = [522, 200];
    const out = await request('u', { fetchImpl: async () => res(statuses.shift()), sleep: noSleep });
    expect(out.status).toBe(200);
  });

  it('gives up after the last try and returns the edge error', async () => {
    const out = await request('u', { fetchImpl: async () => res(524), sleep: noSleep });
    expect(out.status).toBe(524);
  });

  it('does not retry an application error', async () => {
    let calls = 0;
    const out = await request('u', {
      fetchImpl: async () => { calls++; return res(500); },
      sleep: noSleep,
    });
    expect(out.status).toBe(500);
    expect(calls).toBe(1);
  });
});

describe('waitForSha', () => {
  it('waits through a missing stamp and the old build, then matches', async () => {
    const clock = fakeClock();
    const out = await waitForSha({
      baseUrl: BASE,
      expected: SHA,
      timeoutMs: 600_000,
      fetchImpl: versionFetch([null, OLD, OLD, SHA]),
      log: () => {},
      ...clock,
    });
    expect(out.ok).toBe(true);
    expect(out.served).toBe(SHA);
  });

  it('times out reporting what prod still serves', async () => {
    const clock = fakeClock();
    const out = await waitForSha({
      baseUrl: BASE,
      expected: SHA,
      timeoutMs: 60_000,
      fetchImpl: versionFetch([OLD]),
      log: () => {},
      ...clock,
    });
    expect(out.ok).toBe(false);
    expect(out.served).toBe(OLD);
  });
});

describe('watchStable', () => {
  it('passes while prod keeps serving the commit, ignoring unreadable polls', async () => {
    const out = await watchStable({
      baseUrl: BASE,
      expected: SHA,
      durationMs: 100_000,
      fetchImpl: versionFetch([SHA, null, SHA]),
      ...fakeClock(),
    });
    expect(out.ok).toBe(true);
  });

  it('fails when an older build lands after ours', async () => {
    const out = await watchStable({
      baseUrl: BASE,
      expected: SHA,
      durationMs: 300_000,
      fetchImpl: versionFetch([SHA, OLD]),
      ...fakeClock(),
    });
    expect(out).toEqual({ ok: false, served: OLD });
  });
});

describe('runSmokeChecks', () => {
  const SHELL = '<html lang="en"><head><script src="/_next/static/chunks/app.js"></script></head>';

  function site(overrides = {}) {
    const routes = {
      '/': res(200, SHELL),
      '/_next/static/chunks/app.js': res(200, 'js'),
      '/api/listings?limit=1': res(200, { listings: [{ listing_id: '0106002' }] }),
      '/property/thessaloniki/listing/0106002': res(200, '<div data-listing-id="0106002">'),
      '/boarding': res(200, SHELL),
      ...overrides,
    };
    return async (url) => {
      const { pathname, search } = new URL(url);
      return routes[pathname + search] ?? res(404, 'nope');
    };
  }

  const byName = (results) => Object.fromEntries(results.map((r) => [r.name, r]));

  it('passes a healthy site', async () => {
    const results = await runSmokeChecks(BASE, { fetchImpl: site(), sleep: noSleep });
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results.map((r) => r.name)).toEqual([
      'home', 'static-assets', 'listings-api', 'listing-page', 'boarding', 'not-found',
    ]);
  });

  it('fails when a referenced chunk is missing', async () => {
    const fetchImpl = site({ '/_next/static/chunks/app.js': res(404) });
    const r = byName(await runSmokeChecks(BASE, { fetchImpl, sleep: noSleep }));
    expect(r['static-assets'].ok).toBe(false);
    expect(r['static-assets'].detail).toContain('404 /_next/static/chunks/app.js');
  });

  it('fails when the listing page does not render the listing', async () => {
    const fetchImpl = site({ '/property/thessaloniki/listing/0106002': res(200, '<html lang="en">') });
    const r = byName(await runSmokeChecks(BASE, { fetchImpl, sleep: noSleep }));
    expect(r['listing-page'].ok).toBe(false);
  });

  it('skips the listing page when the directory is empty', async () => {
    const fetchImpl = site({ '/api/listings?limit=1': res(200, { listings: [] }) });
    const r = byName(await runSmokeChecks(BASE, { fetchImpl, sleep: noSleep }));
    expect(r['listing-page']).toMatchObject({ ok: true, detail: expect.stringContaining('skipped') });
  });

  it('fails a soft 404', async () => {
    const fetchImpl = async (url) =>
      new URL(url).pathname.startsWith('/post-deploy-check-') ? res(200, SHELL) : site()(url);
    const r = byName(await runSmokeChecks(BASE, { fetchImpl, sleep: noSleep }));
    expect(r['not-found'].ok).toBe(false);
  });
});
