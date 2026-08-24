/*
  Airbnb-style price-bubble map pins (parity Feature 12).

  The pin is a Leaflet `divIcon`, not a marker image: it becomes a real DOM
  element, so it can carry text, hover states and transitions that a PNG
  cannot. The cost is that DOM pins overlap far more aggressively than
  teardrops — see the collision note at the bottom of this file.

  This module is deliberately Leaflet-FREE. It builds the class name and the
  HTML; `ListingsMap.js` hands them to `L.divIcon`. Importing leaflet here
  would pull `window` into module scope and make even `priceLabel` untestable
  in the repo's node-environment Vitest setup — a whole jsdom dependency to
  test string building.

  Styles live in `src/app/globals.css` (search `sx-price-pin`); the states have
  to change without React re-rendering the element, so they are class-driven.
*/

import { formatMoney } from './formatMoney';

/** Root class for a price pin. */
export const PIN_CLASS = 'sx-price-pin';

/**
 * The pill's label: MONTHLY RENT, never a trip total.
 *
 * Airbnb shows a total because a 3-night and a 5-night stay are otherwise
 * incomparable. StudentX prices monthly, and a total would silently reward
 * short stays — a cheap 9-month let would show a bigger number than a pricey
 * 3-month one and read as the more expensive option. Monthly rent stays
 * comparable across every pin regardless of the duration the student picked.
 *
 * @param {{monthly_price?: number|null, currency?: string|null}} listing
 * @returns {string}
 */
export function priceLabel(listing) {
  if (listing?.monthly_price == null) return '—';
  return `${formatMoney(listing.monthly_price, listing.currency)}/mo`;
}

/**
 * Escape a label for interpolation into the divIcon's HTML string.
 *
 * `formatMoney` output is currency-formatted numbers today, so this is belt
 * and braces — but the result reaches an `html` sink, and a sink that only
 * happens to be safe is one regression away from not being.
 *
 * Exported (underscore-prefixed) purely so the guard itself is testable:
 * `formatMoney` sanitises its own input, so no listing can currently drive
 * markup into `priceLabel`, and a test routed through `pinHtml` would pass
 * without the escaping ever running.
 *
 * @param {string} value
 * @returns {string}
 */
export function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Class name for a pin in a given state.
 *
 * Our own `className` REPLACES Leaflet's default `leaflet-div-icon`, which
 * would otherwise paint a white box and a border behind the pill.
 *
 * @param {{visited?: boolean, active?: boolean}} [state]
 * @returns {string}
 */
export function pinClassName({ visited = false, active = false } = {}) {
  return [
    PIN_CLASS,
    visited ? `${PIN_CLASS}--visited` : '',
    active ? `${PIN_CLASS}--active` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Inner HTML for a pin.
 *
 * @param {object} listing
 * @returns {string}
 */
export function pinHtml(listing) {
  return `<span class="${PIN_CLASS}__label">${_escapeHtml(priceLabel(listing))}</span>`;
}

/**
 * The full option bag for `L.divIcon`. Kept here so the anchor maths sits
 * beside the markup it depends on.
 *
 * @param {object} listing
 * @param {{visited?: boolean, active?: boolean}} [state]
 * @returns {object}
 */
export function priceIconOptions(listing, state) {
  return {
    className: pinClassName(state),
    html: pinHtml(listing),
    /*
      Sized to the text rather than a fixed box: prices run 4–9 glyphs and a
      fixed width would either clip "€1,250/mo" or pad "€90/mo" into a slab.
      `iconSize: null` lets CSS own the box; the label's own translate(-50%,-50%)
      then centres it on the coordinate.
    */
    iconSize: null,
    iconAnchor: [0, 0],
    popupAnchor: [0, -18],
  };
}

/*
  COLLISION HANDLING — known gap, deliberately not built yet.

  Price pills are much wider than teardrops, so they overlap at densities where
  teardrops still read cleanly.

  MEASURED, and worse than the spec assumed: the spec says collisions are
  "irrelevant at 3 listings" and become a problem around ~100. On the live
  results page at the default zoom 13, ONE OF THE THREE current Thessaloniki
  pins is already partly covered by another — the inventory sits in a
  ~1 x 1.2 km box, so the pins bunch in the middle of a ~7 x 10 km viewport.
  The real threshold is single digits, not ~100.

  Hover mitigates it (a hovered pin takes z-index 1000 and lifts clear), so no
  price is unreadable, but one is obscured at rest.

  Not fixed here because the fix is a product decision, not a tweak: clustering
  changes what a pin MEANS (one listing vs a count), and the alternatives —
  spiderfying, or nudging overlapping pins apart — trade positional accuracy
  for legibility. Picking one against three listings would be guessing. Raised
  for the founder rather than silently chosen.
*/
