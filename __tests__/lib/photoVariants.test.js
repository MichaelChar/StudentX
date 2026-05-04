import { describe, it, expect } from 'vitest';
import { variantUrl } from '@/lib/photoVariants';

const SUPABASE_BASE = 'https://ecluqurlfbvkxrnoyhaq.supabase.co/storage/v1/object/public/listing-photos';

describe('variantUrl', () => {
  it('swaps __card → __thumb on a card URL', () => {
    const url = `${SUPABASE_BASE}/abc/123-rand__card.webp`;
    expect(variantUrl(url, 'thumb')).toBe(`${SUPABASE_BASE}/abc/123-rand__thumb.webp`);
  });

  it('swaps __card → __full on a card URL', () => {
    const url = `${SUPABASE_BASE}/abc/123-rand__card.webp`;
    expect(variantUrl(url, 'full')).toBe(`${SUPABASE_BASE}/abc/123-rand__full.webp`);
  });

  it('returns the same URL when requesting the size already encoded', () => {
    const url = `${SUPABASE_BASE}/abc/123-rand__card.webp`;
    expect(variantUrl(url, 'card')).toBe(url);
  });

  it('preserves jpg extension when present', () => {
    const url = `${SUPABASE_BASE}/abc/123-rand__card.jpg`;
    expect(variantUrl(url, 'thumb')).toBe(`${SUPABASE_BASE}/abc/123-rand__thumb.jpg`);
  });

  it('preserves jpeg extension when present', () => {
    const url = `${SUPABASE_BASE}/abc/123-rand__card.jpeg`;
    expect(variantUrl(url, 'full')).toBe(`${SUPABASE_BASE}/abc/123-rand__full.jpeg`);
  });

  it('returns legacy Wixstatic URLs unchanged (no variant suffix)', () => {
    const url = 'https://static.wixstatic.com/media/abc123.jpg';
    expect(variantUrl(url, 'thumb')).toBe(url);
    expect(variantUrl(url, 'full')).toBe(url);
  });

  it('returns pre-variant Supabase URLs unchanged', () => {
    const url = `${SUPABASE_BASE}/abc/legacy.jpg`;
    expect(variantUrl(url, 'thumb')).toBe(url);
  });

  it('returns non-string input unchanged', () => {
    expect(variantUrl(null, 'card')).toBe(null);
    expect(variantUrl(undefined, 'card')).toBe(undefined);
  });

  it('defaults to card when size omitted', () => {
    const url = `${SUPABASE_BASE}/abc/123__thumb.webp`;
    expect(variantUrl(url)).toBe(`${SUPABASE_BASE}/abc/123__card.webp`);
  });
});
