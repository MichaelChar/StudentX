import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CITY_PICKER_ENABLED } from '@/lib/cityPicker';
import { BOARDING_ENABLED } from '@/lib/boardingParked';

const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: (...args) => getSupabase(...args),
}));

const sitemap = (await import('@/app/sitemap')).default;

beforeEach(() => {
  getSupabase.mockReset();
});

function fakeSupabase(result) {
  const calls = [];
  const b = {};
  const rec = (name) => (...args) => {
    calls.push([name, ...args]);
    return b;
  };
  for (const m of ['select', 'eq', 'order']) b[m] = rec(m);
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { from: vi.fn(() => b), _calls: calls };
}

const listingUrls = (entries) =>
  entries.filter((e) => e.url.includes('/listing/')).map((e) => e.url);

describe('sitemap()', () => {
  it("only asks for listing_status = 'active' listings", async () => {
    // The regression this guards: the query had no status clause, so drafts
    // (which 404) and paused listings (which are noindex, #205) were handed
    // to Googlebot as crawlable URLs.
    const supa = fakeSupabase({
      data: [{ listing_id: '0106002', updated_at: '2026-09-01T00:00:00Z' }],
      error: null,
    });
    getSupabase.mockReturnValue(supa);

    const entries = await sitemap();

    expect(supa._calls).toContainEqual(['eq', 'listing_status', 'active']);
    expect(listingUrls(entries)).toEqual([
      'https://studentx.uk/property/thessaloniki/listing/0106002',
    ]);
  });

  it('still emits the static routes when the listing query fails', async () => {
    getSupabase.mockReturnValue(
      fakeSupabase({ data: null, error: { message: 'boom' } }),
    );

    const entries = await sitemap();

    expect(listingUrls(entries)).toEqual([]);
    // /property itself is listed only while the city picker is live
    // (src/lib/cityPicker.js); the city landing is always a static route.
    expect(entries.map((e) => e.url)).toContain('https://studentx.uk/property/thessaloniki');
    if (CITY_PICKER_ENABLED) expect(entries.map((e) => e.url)).toContain('https://studentx.uk/property');
    else expect(entries.map((e) => e.url)).not.toContain('https://studentx.uk/property');
  });

  // While boarding is parked (src/lib/boardingParked.js) `/` and /boarding both
  // 307 to the housing landing, and a sitemap that lists a redirect teaches
  // Googlebot the sitemap is unreliable — same reasoning as the listing filter.
  it('lists / and /boarding only while boarding is live', async () => {
    getSupabase.mockReturnValue(
      fakeSupabase({ data: null, error: { message: 'boom' } }),
    );

    const urls = (await sitemap()).map((e) => e.url);

    for (const url of ['https://studentx.uk', 'https://studentx.uk/boarding']) {
      if (BOARDING_ENABLED) expect(urls).toContain(url);
      else expect(urls).not.toContain(url);
    }
    // The other product pages are unaffected either way.
    expect(urls).toContain('https://studentx.uk/admissions');
    expect(urls).toContain('https://studentx.uk/resources');
  });
});
