'use client';

import { useTranslations } from 'next-intl';

/**
 * Universities & commute — read-only.
 *
 * Every distance on this step is measured from the listing's map pin, for
 * every university in the city. There is deliberately nothing to fill in:
 * the landlord's lever is the pin on the Address step, not a number they
 * could type here, and a hand-typed metre count was self-reported data
 * students had no way to sanity-check.
 */
export default function StepUniversities({ form, universities, prefillLoading }) {
  const t = useTranslations('landlord.listingWizard.universities');
  const rows = form.university_distances || [];

  const byId = new Map(
    (universities || []).map((u) => [u.university_id, u]),
  );
  // Nearest first — the ordering a landlord (and a student) reads for.
  const shown = rows
    .map((row) => {
      const meters = Number(row?.distance_meters);
      return {
        university_id: row?.university_id,
        university: byId.get(row?.university_id),
        meters: Number.isFinite(meters) && meters > 0 ? Math.round(meters) : null,
      };
    })
    .filter((r) => r.university)
    .sort((a, b) => (a.meters ?? Infinity) - (b.meters ?? Infinity));

  return (
    <div className="space-y-4">
      <p className="text-sm text-night/70 leading-relaxed">{t('lede')}</p>

      <p className="rounded-control bg-parchment px-3 py-2.5 text-xs text-night/70 leading-relaxed">
        {t('pinNote')}
      </p>

      {prefillLoading && shown.length === 0 ? (
        <p className="text-sm text-night/50">{t('computing')}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-night/50">{t('empty')}</p>
      ) : (
        <ul id="university-distance-rows" className="divide-y divide-night/10">
          {shown.map((row) => (
            <li
              key={row.university_id}
              className="flex items-baseline justify-between gap-4 py-3"
            >
              <span className="text-sm text-night">
                <span className="font-medium">{row.university.short_name}</span>
                <span className="text-night/60"> — {row.university.name}</span>
              </span>
              <span className="text-sm text-night tabular-nums shrink-0">
                {row.meters == null
                  ? t('unmeasured')
                  : t('distance', { metres: row.meters })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
