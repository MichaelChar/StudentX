import { PROPERTIES, VENTURES } from './properties';

/*
  Builders for the props the shared showcase components take, from a
  `showcase`-namespace translator: `getTranslations({ locale, namespace: 'showcase' })`.
  Server-only by use (pages call them); kept apart from properties.js so that
  stays pure data.
*/

/** Props for <VentureTiles>. Only MG² exists so far. */
export function ventureTiles(t) {
  return VENTURES.map((v) => ({
    href: v.href,
    image: v.image,
    markLabel: t('nav.mg2'),
    source: t('ventures.tileSource', { venture: t('nav.mg2'), kind: t('ventures.mg2Kind') }),
    line: t('ventures.mg2Line'),
  }));
}

/** aria-labels for <PropertyStrips>, keyed by property number. */
export function stripLabels(t) {
  return Object.fromEntries(PROPERTIES.map((p) => [p.num, t('property.stripLabel', { num: p.num })]));
}
