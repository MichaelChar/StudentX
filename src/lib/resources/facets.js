/**
 * Pure filtering/faceting logic for the /resources hub. No fs, no DOM — safe
 * to run both at build time (tests) and in the browser (ResourcesExplorer).
 */

import { RESOURCE_TYPE_LABELS, SEMESTER_LABELS, COUNTRY_LABELS } from './taxonomy.js';

/** Facet keys, in the priority order used when relaxing an empty result set. */
export const FACET_KEYS = ['type', 'semester', 'year', 'country'];

// `year` has no fixed label map (see taxonomy.js) — its label is just the
// value itself, e.g. 2026. Filter values always come from the URL query
// string as strings, so every facet value is compared/stored as a string
// here (r.year is a number in the data, "2026" once faceted).
const FACET_LABELS = {
  type: RESOURCE_TYPE_LABELS,
  semester: SEMESTER_LABELS,
  country: COUNTRY_LABELS,
};

/**
 * Returns the options for a single facet, computed from the provided resources.
 * Used internally for both global derivation and context-aware refinement.
 */
export function getFacetOptions(resources, key) {
  const counts = new Map();
  for (const r of resources) {
    const value = String(r[key]);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const options = [...counts.entries()]
    .map(([value, count]) => ({ value, label: FACET_LABELS[key]?.[value] ?? value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  return options;
}

/**
 * Returns the resources that match all active filters *except* the given key.
 * This is the base used to compute available options and counts for that facet
 * (standard faceted search refinement).
 */
export function resourcesMatchingOtherFilters(resources, filters, excludeKey) {
  const otherFilters = { ...filters, [excludeKey]: null };
  return filterResources(resources, otherFilters);
}

/**
 * Facet definitions derived from the live data. A facet is only included when
 * it has >=2 distinct values among `resources` (per spec). This is used to
 * decide *which* facets should be rendered at all.
 * @param {import('./schema.js').ResourceEntry[]} resources
 * @returns {{ key: string, options: { value: string, label: string, count: number }[] }[]}
 */
export function deriveFacets(resources) {
  return FACET_KEYS.map((key) => {
    const options = getFacetOptions(resources, key);
    return { key, options };
  }).filter((facet) => facet.options.length >= 2);
}

/**
 * AND-combine active filters over the resource list. A falsy filter value
 * means "no constraint on this facet". Filter values are always strings
 * (from the URL query string), so resource values are stringified before
 * comparison.
 * @param {import('./schema.js').ResourceEntry[]} resources
 * @param {Record<string, string | null | undefined>} filters
 */
export function filterResources(resources, filters) {
  const active = Object.entries(filters ?? {}).filter(([, v]) => v);
  if (!active.length) return resources;
  return resources.filter((r) => active.every(([key, value]) => String(r[key]) === value));
}

/**
 * Never-empty fallback: if `filters` matches nothing, drop filters one at a
 * time (starting with the facet that changed most recently) until something
 * matches again.
 * @param {import('./schema.js').ResourceEntry[]} resources
 * @param {Record<string, string | null | undefined>} filters
 * @param {string | null} lastChangedKey
 * @returns {{ results: import('./schema.js').ResourceEntry[], filters: Record<string, string | null>, droppedKey: string | null }}
 */
export function relaxFilters(resources, filters, lastChangedKey) {
  const activeKeys = Object.keys(filters ?? {}).filter((k) => filters[k]);
  if (!activeKeys.length) {
    return { results: resources, filters: filters ?? {}, droppedKey: null };
  }

  const dropOrder = [
    ...(lastChangedKey && activeKeys.includes(lastChangedKey) ? [lastChangedKey] : []),
    ...activeKeys.filter((k) => k !== lastChangedKey),
  ];

  let current = { ...filters };
  for (const key of dropOrder) {
    current = { ...current, [key]: null };
    const results = filterResources(resources, current);
    if (results.length) {
      return { results, filters: current, droppedKey: key };
    }
  }
  return { results: resources, filters: {}, droppedKey: 'all' };
}
