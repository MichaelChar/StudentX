import { describe, it, expect } from 'vitest';
import {
  parseBoundsParams,
  applyBoundsFilter,
  quantiseBounds,
  quantiseCoord,
  boundsToParams,
  boundsDrift,
  BOUNDS_DRIFT_THRESHOLD,
} from '@/lib/mapBounds';

const sp = (obj) => new URLSearchParams(obj);

// Thessaloniki-shaped box, already on the 3dp grid so quantisation is a no-op
// and the assertions below are about the logic under test, not the rounding.
const BOX = { min_lat: '40.598', max_lat: '40.653', min_lng: '22.935', max_lng: '22.967' };

describe('parseBoundsParams', () => {
  it('returns null bounds when none are requested (whole-city search)', () => {
    expect(parseBoundsParams(sp({})).bounds).toBeNull();
    expect(parseBoundsParams(sp({ types: 'Studio' })).bounds).toBeNull();
  });

  it('parses a complete box', () => {
    expect(parseBoundsParams(sp(BOX)).bounds).toEqual({
      minLat: 40.598,
      maxLat: 40.653,
      minLng: 22.935,
      maxLng: 22.967,
    });
  });

  /*
    All four or none. A partial box is a caller bug, and inventing the missing
    edge would silently answer a different question than the one asked.
  */
  it('rejects a partial box and names what was missing', () => {
    const r = parseBoundsParams(sp({ min_lat: '40.5', max_lat: '40.7' }));
    expect(r.bounds).toBeUndefined();
    expect(r.error).toContain('min_lng');
    expect(r.error).toContain('max_lng');
  });

  it('rejects non-numeric values', () => {
    expect(parseBoundsParams(sp({ ...BOX, min_lat: 'abc' })).error).toContain('min_lat');
    expect(parseBoundsParams(sp({ ...BOX, max_lng: '' })).error).toContain('max_lng');
  });

  it('rejects NaN-adjacent values that Number() would let through', () => {
    expect(parseBoundsParams(sp({ ...BOX, min_lat: 'Infinity' })).error).toContain('min_lat');
  });

  it('rejects an off-globe box', () => {
    expect(parseBoundsParams(sp({ ...BOX, min_lat: '-91' })).error).toContain('latitude');
    expect(parseBoundsParams(sp({ ...BOX, max_lat: '91' })).error).toContain('latitude');
    expect(parseBoundsParams(sp({ ...BOX, min_lng: '-181' })).error).toContain('longitude');
    expect(parseBoundsParams(sp({ ...BOX, max_lng: '181' })).error).toContain('longitude');
  });

  it('rejects an inverted box', () => {
    expect(parseBoundsParams(sp({ ...BOX, min_lat: '41', max_lat: '40' })).error)
      .toContain('min_lat');
  });

  // An antimeridian-crossing viewport is legitimate but not expressible as one
  // BETWEEN. Rejected loudly so it fails visibly if a city ever lands there,
  // rather than quietly returning nothing.
  it('rejects an antimeridian-crossing box rather than silently returning nothing', () => {
    expect(parseBoundsParams(sp({ ...BOX, min_lng: '179', max_lng: '-179' })).error)
      .toContain('min_lng');
  });

  it('accepts a degenerate (zero-area) box', () => {
    const r = parseBoundsParams(
      sp({ min_lat: '40.6', max_lat: '40.6', min_lng: '22.9', max_lng: '22.9' }),
    );
    expect(r.error).toBeUndefined();
    expect(r.bounds.minLat).toBe(r.bounds.maxLat);
  });

  it('quantises on the way in, so the parsed box matches the cache key', () => {
    const r = parseBoundsParams(
      sp({
        min_lat: '40.5981234',
        max_lat: '40.6534567',
        min_lng: '22.9351111',
        max_lng: '22.9669999',
      }),
    );
    expect(r.bounds).toEqual({
      minLat: 40.598,
      maxLat: 40.654,
      minLng: 22.935,
      maxLng: 22.967,
    });
  });
});

describe('quantiseBounds', () => {
  /*
    The load-bearing property: quantisation expands OUTWARD. Rounding both
    edges to nearest would let a listing within ~55m of the edge drop out of a
    box the student can see it inside — pin visibly on screen, card gone. A
    superset can only ever show one extra.
  */
  it('expands outward, never inward', () => {
    const raw = { minLat: 40.5985, maxLat: 40.6535, minLng: 22.9355, maxLng: 22.9665 };
    const q = quantiseBounds(raw);
    expect(q.minLat).toBeLessThanOrEqual(raw.minLat);
    expect(q.maxLat).toBeGreaterThanOrEqual(raw.maxLat);
    expect(q.minLng).toBeLessThanOrEqual(raw.minLng);
    expect(q.maxLng).toBeGreaterThanOrEqual(raw.maxLng);
  });

  it('is idempotent — re-quantising a quantised box changes nothing', () => {
    const once = quantiseBounds({ minLat: 40.5981, maxLat: 40.6539, minLng: 22.9351, maxLng: 22.9669 });
    expect(quantiseBounds(once)).toEqual(once);
  });

  it('collapses nearby viewports onto one cache key', () => {
    const a = quantiseBounds({ minLat: 40.59801, maxLat: 40.65301, minLng: 22.93501, maxLng: 22.96701 });
    const b = quantiseBounds({ minLat: 40.59802, maxLat: 40.65302, minLng: 22.93502, maxLng: 22.96702 });
    expect(a).toEqual(b);
  });

  // -0 serialises as "-0" and would fork the cache key from "0".
  it('normalises negative zero', () => {
    expect(Object.is(quantiseCoord(-0.0001), -0)).toBe(false);
    expect(boundsToParams({ minLat: -0.0001, maxLat: 0, minLng: -0.0001, maxLng: 0 }).max_lat)
      .toBe('0');
  });
});

describe('boundsToParams', () => {
  it('serialises the same quantised values the API will parse back', () => {
    const params = boundsToParams({
      minLat: 40.5981234,
      maxLat: 40.6534567,
      minLng: 22.9351111,
      maxLng: 22.9669999,
    });
    expect(params).toEqual({
      min_lat: '40.598',
      max_lat: '40.654',
      min_lng: '22.935',
      max_lng: '22.967',
    });
    // Round-trip: what the page puts in the URL is what the API reads out.
    expect(parseBoundsParams(sp(params)).bounds).toEqual({
      minLat: 40.598,
      maxLat: 40.654,
      minLng: 22.935,
      maxLng: 22.967,
    });
  });
});

describe('boundsDrift', () => {
  const searched = { minLat: 40.6, maxLat: 40.7, minLng: 22.9, maxLng: 23.0 };

  it('is 0 with nothing to compare', () => {
    expect(boundsDrift(null, searched)).toBe(0);
    expect(boundsDrift(searched, null)).toBe(0);
  });

  it('is 0 for an unmoved map', () => {
    expect(boundsDrift(searched, { ...searched })).toBe(0);
  });

  it('reports a half-pane pan as ~0.5 regardless of zoom', () => {
    const panned = { minLat: 40.65, maxLat: 40.75, minLng: 22.9, maxLng: 23.0 };
    expect(boundsDrift(searched, panned)).toBeCloseTo(0.5, 5);

    // Same gesture, 10x tighter zoom — same ratio.
    const tight = { minLat: 40.6, maxLat: 40.61, minLng: 22.9, maxLng: 22.91 };
    const tightPanned = { minLat: 40.605, maxLat: 40.615, minLng: 22.9, maxLng: 22.91 };
    expect(boundsDrift(tight, tightPanned)).toBeCloseTo(0.5, 5);
  });

  it('counts a zoom-out with no pan as movement', () => {
    // Zooming out reveals area the last search never covered.
    const zoomedOut = { minLat: 40.55, maxLat: 40.75, minLng: 22.85, maxLng: 23.05 };
    expect(boundsDrift(searched, zoomedOut)).toBeGreaterThan(BOUNDS_DRIFT_THRESHOLD);
  });

  it('stays under the threshold for a trivial nudge', () => {
    const nudged = { minLat: 40.601, maxLat: 40.701, minLng: 22.9, maxLng: 23.0 };
    expect(boundsDrift(searched, nudged)).toBeLessThan(BOUNDS_DRIFT_THRESHOLD);
  });

  it('crosses the threshold for a deliberate pan', () => {
    const panned = { minLat: 40.63, maxLat: 40.73, minLng: 22.9, maxLng: 23.0 };
    expect(boundsDrift(searched, panned)).toBeGreaterThan(BOUNDS_DRIFT_THRESHOLD);
  });

  /*
    Regression: a zero-area baseline used to divide by an epsilon, which made
    two IDENTICAL degenerate boxes read as drift = 1 — enough to pop
    `Search this area` open on page load, because Leaflet's getBounds() returns
    a single point while the map container is still unsized. Asserting
    finiteness alone did not catch it; assert the VALUE.
  */
  it('reports no drift for a zero-area baseline, rather than a ratio', () => {
    const degenerate = { minLat: 40.6, maxLat: 40.6, minLng: 22.9, maxLng: 22.9 };
    expect(boundsDrift(degenerate, degenerate)).toBe(0);
    expect(boundsDrift(degenerate, searched)).toBe(0);
  });

  it('reports no drift for a zero-width baseline', () => {
    const zeroLng = { minLat: 40.6, maxLat: 40.7, minLng: 22.9, maxLng: 22.9 };
    expect(boundsDrift(zeroLng, searched)).toBe(0);
  });
});

describe('applyBoundsFilter', () => {
  function fakeQuery() {
    const calls = [];
    const q = {
      calls,
      gte(col, val) {
        calls.push(['gte', col, val]);
        return q;
      },
      lte(col, val) {
        calls.push(['lte', col, val]);
        return q;
      },
    };
    return q;
  }

  it('is a no-op for a whole-city search', () => {
    const q = fakeQuery();
    expect(applyBoundsFilter(q, null)).toBe(q);
    expect(q.calls).toEqual([]);
  });

  it('applies four clauses against the joined location columns', () => {
    const q = fakeQuery();
    applyBoundsFilter(q, { minLat: 40.598, maxLat: 40.653, minLng: 22.935, maxLng: 22.967 });
    expect(q.calls).toEqual([
      ['gte', 'location.lat', 40.598],
      ['lte', 'location.lat', 40.653],
      ['gte', 'location.lng', 22.935],
      ['lte', 'location.lng', 22.967],
    ]);
  });
});
