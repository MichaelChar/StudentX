import { describe, it, expect, vi } from 'vitest';
import {
  isBlockedResponse,
  preprocessHtml,
  fetchListingHtml,
  extractListingFields,
  buildPendingListing,
} from '@/lib/pendingIngest';

const LONG_BODY = '<p>Sunny studio in Ano Poli near AUTH campus. </p>'.repeat(120); // > 2KB

function fakeImageResponse() {
  return { ok: true, headers: { get: () => 'image/jpeg' }, arrayBuffer: async () => new ArrayBuffer(16) };
}

// One mock standing in for fetch(): image URLs return bytes, everything else
// returns the given html with the given status.
function makeFetch({ html = LONG_BODY, status = 200 } = {}) {
  return vi.fn(async (u) => {
    if (/\.(jpe?g|png|webp)/i.test(u) || u.includes('/photo')) return fakeImageResponse();
    return { ok: status < 400, status, url: u, text: async () => html };
  });
}

const fakeSupabase = {
  storage: {
    from: () => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
    }),
  },
};

describe('isBlockedResponse', () => {
  it('blocks on error statuses and short/challenge bodies', () => {
    expect(isBlockedResponse(403, LONG_BODY)).toBe(true);
    expect(isBlockedResponse(429, LONG_BODY)).toBe(true);
    expect(isBlockedResponse(503, LONG_BODY)).toBe(true);
    expect(isBlockedResponse(200, 'tiny')).toBe(true);
    expect(isBlockedResponse(200, 'Just a moment...'.padEnd(3000, ' '))).toBe(true);
  });
  it('passes a normal long body', () => {
    expect(isBlockedResponse(200, LONG_BODY)).toBe(false);
  });
});

describe('preprocessHtml', () => {
  it('strips script/style and keeps visible text, truncating to budget', () => {
    const out = preprocessHtml('<script>var secret=1</script><style>.x{}</style><p>visible text</p>');
    expect(out).toContain('visible text');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('.x{}');
  });
  it('does not strip <head> when removing <header>', () => {
    const out = preprocessHtml('<head><meta content="keepme"></head><header>chrome</header><p>body</p>');
    expect(out).toContain('keepme');
    expect(out).not.toContain('chrome');
  });
});

describe('fetchListingHtml', () => {
  it('returns ok for a healthy page', async () => {
    const r = await fetchListingHtml('https://x.gr/listing/1', makeFetch());
    expect(r.ok).toBe(true);
    expect(r.html).toContain('Ano Poli');
  });
  it('marks 403 as blocked', async () => {
    const r = await fetchListingHtml('https://x.gr/listing/1', makeFetch({ status: 403 }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('blocked');
  });
  it('never throws on network failure', async () => {
    const r = await fetchListingHtml('https://x.gr/1', vi.fn(async () => { throw new Error('boom'); }));
    expect(r).toEqual({ ok: false, reason: 'fetch_failed' });
  });
});

describe('extractListingFields', () => {
  it('parses the model response', async () => {
    const ai = { run: vi.fn(async () => ({ response: '{"address":"Egnatia 1","property_type":"studio"}' })) };
    const out = await extractListingFields(ai, 'html');
    expect(out).toEqual({ address: 'Egnatia 1', property_type: 'studio' });
    expect(ai.run).toHaveBeenCalledOnce();
  });
});

describe('buildPendingListing', () => {
  const goodAi = {
    run: vi.fn(async () => ({
      response: JSON.stringify({
        address: 'Egnatia 100',
        neighborhood: 'Kentro',
        beds: 1,
        baths: 1,
        sqm: 45,
        price_eur_month: 480,
        property_type: '1-bed',
        description: 'Nice flat',
        photo_urls: ['/photos/a.jpg', 'https://cdn/b.png'],
        contact_phone: '+30 690',
        contact_email: null,
      }),
    })),
  };

  it('returns a populated pending row + uploaded photos on success', async () => {
    const row = await buildPendingListing({
      url: 'https://x.gr/listing/1',
      ai: goodAi,
      supabase: fakeSupabase,
      id: 'pli_1',
      fetchImpl: makeFetch(),
    });
    expect(row.status).toBe('pending');
    expect(row.price_eur_month).toBe(480);
    expect(row.property_type).toBe('1-bed');
    expect(row.photos_json).toHaveLength(2);
    expect(row.photos_json[0].url).toContain('https://cdn.test/pending/pli_1/');
  });

  it('marks needs_manual_entry when the page is blocked', async () => {
    const row = await buildPendingListing({
      url: 'https://x.gr/1',
      ai: goodAi,
      supabase: fakeSupabase,
      id: 'pli_2',
      fetchImpl: makeFetch({ status: 403 }),
    });
    expect(row.status).toBe('needs_manual_entry');
    expect(row.photos_json).toEqual([]);
  });

  it('marks needs_manual_entry when the model returns junk', async () => {
    const badAi = { run: vi.fn(async () => ({ response: 'I could not find anything useful.' })) };
    const row = await buildPendingListing({
      url: 'https://x.gr/listing/1',
      ai: badAi,
      supabase: fakeSupabase,
      id: 'pli_3',
      fetchImpl: makeFetch(),
    });
    expect(row.status).toBe('needs_manual_entry');
  });

  it('marks error when the AI binding throws', async () => {
    const throwingAi = { run: vi.fn(async () => { throw new Error('AI unavailable'); }) };
    const row = await buildPendingListing({
      url: 'https://x.gr/listing/1',
      ai: throwingAi,
      supabase: fakeSupabase,
      id: 'pli_4',
      fetchImpl: makeFetch(),
    });
    expect(row.status).toBe('error');
  });
});
