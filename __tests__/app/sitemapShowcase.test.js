import { describe, it, expect, vi } from 'vitest';
import { PROPERTIES } from '@/lib/showcase/properties';
import { isParkedPath } from '@/lib/showcase';

// The sitemap while the showcase is live (src/lib/showcase.js): the showcase's
// pages only. Every platform URL is a 307 then, so none may be listed, even
// the live listings the platform query still returns.
vi.mock('@/lib/showcase', async (importOriginal) => ({ ...(await importOriginal()), SHOWCASE_LIVE: true }));

const rows = { data: [{ listing_id: '0106001', updated_at: '2026-11-01T00:00:00Z' }], error: null };
vi.mock('@/lib/supabase', () => {
  const b = {};
  for (const m of ['select', 'eq', 'order']) b[m] = () => b;
  b.then = (resolve, reject) => Promise.resolve(rows).then(resolve, reject);
  return { getSupabase: () => ({ from: () => b }) };
});

const sitemap = (await import('@/app/sitemap')).default;

describe('sitemap() with the showcase live', () => {
  it('lists the showcase pages and every shown property', async () => {
    const paths = (await sitemap()).map((e) => new URL(e.url).pathname);
    for (const p of ['/', '/about-us', '/press', '/ventures', '/mg2', '/map', '/featured-properties']) {
      expect(paths, p).toContain(p);
    }
    for (const p of PROPERTIES) expect(paths).toContain(`/featured-properties/${p.num}`);
  });

  it('lists nothing parked', async () => {
    const parked = (await sitemap()).map((e) => new URL(e.url).pathname).filter(isParkedPath);
    expect(parked).toEqual([]);
  });
});
