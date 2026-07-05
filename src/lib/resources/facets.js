/**
 * Pure filtering/faceting logic for the /resources hub. No fs, no DOM — safe
 * to run both at build time (tests) and in the browser (ResourcesExplorer).
 */

import { RESOURCE_TYPE_LABELS, SEMESTER_LABELS, COUNTRY_LABELS } from './taxonomy.js';

/** Facet keys, in the priority order used when relaxing an empty result set. */
export const FACET_KEYS = ['type', 'semester', 'country'];

const FACET_LABELS = {
  type: RESOURCE_TYPE_LABELS,
  semester: SEMESTER_LABELS,
  country: COUNTRY_LABELS,
};

/**
 * Facet definitions derived from the live data. A facet is only included when
 * it has >=2 distinct values among `resources` (per spec).
 * @param {import('./schema.js').ResourceEntry[]} resources
 * @returns {{ key: string, options: { value: string, label: string, count: number }[] }[]}
 */
export function deriveFacets(resources) {
  return FACET_KEYS.map((key) => {
    const counts = new Map();
    for (const r of resources) {
      counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
    }
    const options = [...counts.entries()]
      .map(([value, count]) => ({ value, label: FACET_LABELS[key][value] ?? value, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return { key, options };
  }).filter((facet) => facet.options.length >= 2);
}

/**
 * AND-combine active filters over the resource list. A falsy filter value
 * means "no constraint on this facet".
 * @param {import('./schema.js').ResourceEntry[]} resources
 * @param {Record<string, string | null | undefined>} filters
 */
export function filterResources(resources, filters) {
  const active = Object.entries(filters ?? {}).filter(([, v]) => v);
  if (!active.length) return resources;
  return resources.filter((r) => active.every(([key, value]) => r[key] === value));
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
