'use client';

import { useTranslations } from 'next-intl';
import { MAX_DISTANCE_METERS } from '@/lib/universityDistances';
import { MIN_UNIVERSITY_DISTANCES } from '@/lib/universityDistances';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepUniversities({
  form,
  setField,
  universities,
  prefillLoading,
  onPrefill,
  onAddUniversity,
}) {
  const t = useTranslations('landlord.listingWizard.universities');
  const rows = form.university_distances || [];

  function addRow() {
    // Parent computes distance from the map pin for the new uni.
    if (onAddUniversity) {
      void onAddUniversity();
      return;
    }
    // Fallback when rendered without the parent handler: empty shell the
    // landlord types into.
    const taken = new Set(rows.map((d) => d.university_id));
    const next = (universities || []).find((u) => !taken.has(u.university_id));
    if (!next) return;
    setField('university_distances', [
      ...rows,
      {
        university_id: next.university_id,
        distance_meters: '',
        source: 'landlord',
      },
    ]);
  }

  function updateRow(index, field, value) {
    setField(
      'university_distances',
      rows.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, [field]: value };
        // Editing a computed value flips provenance to landlord.
        if (field === 'distance_meters' && row.source === 'computed') {
          next.source = 'landlord';
        }
        return next;
      }),
    );
  }

  function removeRow(index) {
    setField(
      'university_distances',
      rows.filter((_, i) => i !== index),
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-night/70 leading-relaxed">{t('lede')}</p>
        <p className="mt-1 text-xs text-night/50">
          {t('minRequired', { count: MIN_UNIVERSITY_DISTANCES })}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPrefill}
          disabled={prefillLoading}
        >
          {prefillLoading ? t('prefilling') : t('prefill')}
        </Button>
        {rows.length < (universities || []).length && (
          <button
            type="button"
            onClick={addRow}
            disabled={prefillLoading}
            className="label-caps text-blue hover:underline active:text-blue/80 transition-colors disabled:opacity-50 disabled:no-underline"
          >
            {t('add')}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const taken = new Set(
            rows.filter((_, j) => j !== i).map((d) => d.university_id),
          );
          return (
            <div
              key={`${row.university_id}-${i}`}
              className="flex flex-col sm:flex-row sm:items-center gap-2"
            >
              <select
                value={row.university_id}
                onChange={(e) => updateRow(i, 'university_id', e.target.value)}
                className={`${inputClass} flex-1`}
              >
                {(universities || []).map((u) => (
                  <option
                    key={u.university_id}
                    value={u.university_id}
                    disabled={taken.has(u.university_id)}
                  >
                    {u.short_name} — {u.name}
                  </option>
                ))}
              </select>
              <div className="relative w-full sm:w-40 shrink-0">
                <input
                  type="number"
                  min="1"
                  max={MAX_DISTANCE_METERS}
                  step="10"
                  value={row.distance_meters}
                  onChange={(e) =>
                    updateRow(i, 'distance_meters', e.target.value)
                  }
                  className={`${inputClass} pr-14`}
                  placeholder={t('metresPlaceholder')}
                  aria-label={t('metresLabel')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-night/40">
                  {t('unit')}
                </span>
              </div>
              <Pill
                variant={row.source === 'computed' ? 'info' : 'amenity'}
                className="shrink-0"
              >
                {row.source === 'computed' ? t('sourceComputed') : t('sourceLandlord')}
              </Pill>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 p-2 text-night/40 hover:text-night active:text-night/80 transition-colors rounded-control"
                aria-label={t('remove')}
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {rows.length === 0 && (
        <p className="text-sm text-night/50">{t('empty')}</p>
      )}
    </div>
  );
}
