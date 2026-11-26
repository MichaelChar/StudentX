import data from './properties.generated.json';

/*
  The showcase's properties and ventures.

  Facts, gallery order and image sizes come from properties.generated.json,
  written by scripts/showcase/prepare-images.py from the property board's
  readback (the board is the source of truth for property details). Copy — the
  stories and every label — lives in src/messages/en.json under `showcase`.

  101, 102 and 103 are the names; the three live flats (0106001-0106003) stand
  in for them until the real property list arrives. There are deliberately no
  "to come" slots anywhere (founder's call, 2026-11-23): a property or venture
  appears once it has real content.
*/

/** Properties shown on the site, in order. */
export const PROPERTIES = data.properties.filter((p) => p.show);

export const IMAGES = data.images;

export function getProperty(num) {
  return PROPERTIES.find((p) => p.num === String(num)) ?? null;
}

/** Previous and next property, wrapping round (the property page's arrows). */
export function neighbours(num) {
  const i = PROPERTIES.findIndex((p) => p.num === String(num));
  if (i < 0) return { prev: null, next: null };
  const n = PROPERTIES.length;
  return { prev: PROPERTIES[(i + n - 1) % n].num, next: PROPERTIES[(i + 1) % n].num };
}

/** Neighbourhoods with a property, for the Map page's filter, in first-seen order. */
export const NEIGHBOURHOODS = [...new Set(PROPERTIES.map((p) => p.neighbourhood))];

/*
  Pin positions on the Map page's schematic of central Thessaloniki (the demo's
  SVG, viewBox "8 40 184 150"). `labelEnd` puts the number to the left of the
  pin where it would otherwise run into a neighbour. Add a row when a property
  is added; the test fails for a shown property with no pin.
*/
export const MAP_PINS = {
  101: { x: 93.5, y: 101.5, labelEnd: true },
  102: { x: 109.5, y: 66.5 },
  103: { x: 125.5, y: 123.5 },
};

/**
 * Ventures. Only MG² so far; a single venture renders as one wide tile. Its
 * photo is 103-08 in every spot (founder's pick, demo v14).
 */
export const VENTURES = [{ slug: 'mg2', href: '/mg2', image: data.images.mg2 }];
