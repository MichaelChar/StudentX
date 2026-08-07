'use client';

import { useTranslations } from 'next-intl';
import {
  MIN_DURATION_MONTHS,
  MAX_DURATION_MONTHS,
} from '@/lib/listingDuration';
import SuggestedMark from '@/components/listing-wizard/SuggestedMark';

const inputClass =
  'w-full border border-night/15 bg-white rounded-sm px-3 py-2.5 text-sm text-night focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepPrice({
  form,
  setField,
  suggested = {},
  onDismissSuggestion,
}) {
  const t = useTranslations('landlord.listingWizard.price');
  const months = Array.from(
    { length: MAX_DURATION_MONTHS - MIN_DURATION_MONTHS + 1 },
    (_, i) => MIN_DURATION_MONTHS + i,
  );

  function dismiss(field, empty = '') {
    if (onDismissSuggestion) onDismissSuggestion(field, empty);
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="wiz-rent">
            {t('rentLabel')}
            <SuggestedMark
              show={!!suggested.monthly_price}
              onDismiss={() => dismiss('monthly_price')}
            />
          </label>
          <input
            id="wiz-rent"
            type="number"
            min="1"
            value={form.monthly_price}
            onChange={(e) => setField('monthly_price', e.target.value)}
            className={inputClass}
            placeholder={t('rentPlaceholder')}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="wiz-deposit">
            {t('depositLabel')}
            <SuggestedMark
              show={!!suggested.deposit}
              onDismiss={() => dismiss('deposit')}
            />
          </label>
          <input
            id="wiz-deposit"
            type="number"
            min="0"
            value={form.deposit}
            onChange={(e) => setField('deposit', e.target.value)}
            className={inputClass}
            placeholder={t('depositPlaceholder')}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.bills_included === true}
          onChange={(e) => setField('bills_included', e.target.checked)}
          className="w-4 h-4 accent-blue"
        />
        <span className="text-sm text-night">
          {t('billsIncluded')}
          <SuggestedMark
            show={!!suggested.bills_included}
            onDismiss={() => dismiss('bills_included', false)}
          />
        </span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="wiz-min-dur">
            {t('minDurationLabel')}
          </label>
          <select
            id="wiz-min-dur"
            value={form.min_duration_months}
            onChange={(e) => setField('min_duration_months', e.target.value)}
            className={inputClass}
          >
            {months.map((n) => (
              <option key={n} value={String(n)}>
                {t('monthsOption', { n })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-night/50">{t('minDurationTip')}</p>
        </div>
        <div>
          <label className={labelClass} htmlFor="wiz-max-dur">
            {t('maxDurationLabel')}
          </label>
          <select
            id="wiz-max-dur"
            value={form.max_duration_months}
            onChange={(e) => setField('max_duration_months', e.target.value)}
            className={inputClass}
          >
            <option value="">{t('maxDurationNone')}</option>
            {months.map((n) => (
              <option key={n} value={String(n)}>
                {t('monthsOption', { n })}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-night/50">{t('maxDurationTip')}</p>
        </div>
      </div>
    </div>
  );
}
