import { describe, it, expect } from 'vitest';
import {
  priceIconOptions,
  pinClassName,
  pinHtml,
  priceLabel,
  _escapeHtml,
  PIN_CLASS,
} from '@/lib/mapPriceIcon';

describe('priceLabel', () => {
  // The core Feature 12 decision: the pill shows MONTHLY rent, never a trip
  // total. A total would make a cheap 9-month let look dearer than a pricey
  // 3-month one. If this test is ever "fixed" to expect a total, read the
  // rationale in mapPriceIcon.js first.
  it('renders monthly rent with a /mo suffix', () => {
    expect(priceLabel({ monthly_price: 450, currency: 'EUR' })).toBe('€450/mo');
  });

  it('respects a non-EUR currency', () => {
    expect(priceLabel({ monthly_price: 900, currency: 'GBP' })).toBe('£900/mo');
  });

  it('falls back to a dash when the price is missing', () => {
    expect(priceLabel({ monthly_price: null })).toBe('—');
    expect(priceLabel({})).toBe('—');
    expect(priceLabel(undefined)).toBe('—');
  });

  it('does not treat a zero price as missing', () => {
    expect(priceLabel({ monthly_price: 0, currency: 'EUR' })).toBe('€0/mo');
  });
});

describe('priceIconOptions', () => {
  it('carries the price into the icon markup', () => {
    const icon = priceIconOptions({ monthly_price: 450, currency: 'EUR' });
    expect(icon.html).toContain('€450/mo');
    expect(icon.html).toContain(`${PIN_CLASS}__label`);
  });

  // Passing our own className REPLACES Leaflet's `leaflet-div-icon`, which
  // would otherwise paint a white box behind the pill.
  it('uses the pin class as the root class, not leaflet-div-icon', () => {
    const icon = priceIconOptions({ monthly_price: 450 });
    expect(icon.className).toBe(PIN_CLASS);
    expect(icon.className).not.toContain('leaflet-div-icon');
  });

  it('adds the visited modifier only when visited', () => {
    expect(priceIconOptions({ monthly_price: 1 }, { visited: true }).className)
      .toContain(`${PIN_CLASS}--visited`);
    expect(priceIconOptions({ monthly_price: 1 }, { visited: false }).className)
      .not.toContain(`${PIN_CLASS}--visited`);
  });

  it('adds the active modifier only when active', () => {
    expect(priceIconOptions({ monthly_price: 1 }, { active: true }).className)
      .toContain(`${PIN_CLASS}--active`);
    expect(priceIconOptions({ monthly_price: 1 }).className)
      .not.toContain(`${PIN_CLASS}--active`);
  });

  it('combines visited and active', () => {
    const cls = pinClassName({ visited: true, active: true });
    expect(cls).toContain(`${PIN_CLASS}--visited`);
    expect(cls).toContain(`${PIN_CLASS}--active`);
  });

  /*
    The label reaches an `html` sink. formatMoney sanitises its own input — an
    unknown currency code yields a bare number, not the code — so no listing
    can currently drive markup this far, and a test routed through pinHtml
    would pass whether or not the escaping ran. Assert on the guard itself so
    it cannot be deleted silently.
  */
  it('escapes markup reaching the html sink', () => {
    expect(_escapeHtml('<img src=x onerror=alert(1)>')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;',
    );
    expect(_escapeHtml(`&"'`)).toBe('&amp;&quot;&#39;');
  });

  it('emits a plain number when the currency code is unusable', () => {
    // Documents WHY the sink test above is not routed through a listing.
    expect(pinHtml({ monthly_price: 450, currency: '<img src=x>' })).not.toContain(
      '<img',
    );
  });

  it('centres the pin on its coordinate and lets CSS own the box size', () => {
    const opts = priceIconOptions({ monthly_price: 450 });
    expect(opts.iconSize).toBeNull();
    expect(opts.iconAnchor).toEqual([0, 0]);
  });
});
