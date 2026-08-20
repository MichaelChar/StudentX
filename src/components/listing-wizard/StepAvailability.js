'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Icon from '@/components/ui/Icon';
import SuggestedMark from '@/components/listing-wizard/SuggestedMark';

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepAvailability({
  form,
  setField,
  suggested = {},
  onDismissSuggestion,
}) {
  const t = useTranslations('landlord.listingWizard.availability');
  const blackouts = form.blackouts || [];

  function addBlackout() {
    setField('blackouts', [
      ...blackouts,
      { start_date: '', end_date: '' },
    ]);
  }

  function updateBlackout(index, field, value) {
    setField(
      'blackouts',
      blackouts.map((b, i) => (i === index ? { ...b, [field]: value } : b)),
    );
  }

  function removeBlackout(index) {
    setField(
      'blackouts',
      blackouts.filter((_, i) => i !== index),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="wiz-from">
            {t('availableFromLabel')}
            <SuggestedMark
              show={!!suggested.available_from}
              onDismiss={() =>
                onDismissSuggestion && onDismissSuggestion('available_from', '')
              }
            />
          </label>
          <input
            id="wiz-from"
            type="date"
            value={form.available_from}
            onChange={(e) => setField('available_from', e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wiz-to">
            {t('availableToLabel')}
          </label>
          <input
            id="wiz-to"
            type="date"
            value={form.available_to}
            onChange={(e) => setField('available_to', e.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-night/50">{t('availableToTip')}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className={labelClass + ' mb-0'}>{t('blackoutsLabel')}</p>
          <Button type="button" variant="outline" size="sm" onClick={addBlackout}>
            {t('addBlackout')}
          </Button>
        </div>
        <p className="text-xs text-night/50 mb-3">{t('blackoutsTip')}</p>

        {blackouts.length === 0 ? (
          <p className="text-sm text-night/50">{t('blackoutsEmpty')}</p>
        ) : (
          <div className="space-y-2">
            {blackouts.map((b, i) => (
              <div
                key={i}
                className="flex flex-col sm:flex-row sm:items-center gap-2"
              >
                <input
                  type="date"
                  value={b.start_date}
                  onChange={(e) => updateBlackout(i, 'start_date', e.target.value)}
                  className={inputClass}
                  aria-label={t('blackoutStart')}
                />
                <span className="text-xs text-night/40 hidden sm:inline">→</span>
                <input
                  type="date"
                  value={b.end_date}
                  onChange={(e) => updateBlackout(i, 'end_date', e.target.value)}
                  className={inputClass}
                  aria-label={t('blackoutEnd')}
                />
                <button
                  type="button"
                  onClick={() => removeBlackout(i)}
                  className="p-2 text-night/40 hover:text-night active:text-night/80 transition-colors rounded-control"
                  aria-label={t('removeBlackout')}
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
