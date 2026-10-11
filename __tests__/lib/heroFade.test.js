import { describe, it, expect } from 'vitest';
import { heroFade } from '@/lib/heroFade';

describe('heroFade', () => {
  it('returns 1 at scroll 0 for the server viewport and unusable heights', () => {
    for (const vh of [800, 0, undefined, NaN, -5]) {
      expect(heroFade(0, vh)).toBe(1);
    }
  });

  it('follows the fade curve at vh 800', () => {
    // 320 / (800 * 0.8) = 320 / 640.
    expect(heroFade(320, 800)).toBeCloseTo(1 - (320 / 640) * 0.86);
  });

  it('floors at the watermark once the page has scrolled far', () => {
    expect(heroFade(100000, 800)).toBe(0.14);
  });

  it('never returns NaN for odd inputs', () => {
    const scrolls = [NaN, undefined, -40];
    const heights = [0, undefined, Infinity];
    for (const y of scrolls) {
      for (const vh of heights) {
        expect(Number.isNaN(heroFade(y, vh))).toBe(false);
      }
    }
  });

  it('agrees between the server assumption and a zero client viewport', () => {
    expect(heroFade(0, undefined)).toBe(heroFade(0, 0));
    expect(heroFade(0, 0)).toBe(heroFade(0, 800));
  });
});
