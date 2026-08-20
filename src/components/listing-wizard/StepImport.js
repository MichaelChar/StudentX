'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';
import {
  PASTE_FIELD_LABEL_KEYS,
  PASTE_MAX_LENGTH,
  parseListingPaste,
} from '@/lib/pasteImport';

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

/**
 * Wizard step 0 — paste a listing description to pre-fill later steps.
 *
 * Props:
 *   pasteText / setPasteText — controlled draft text (lifted so Back restores it)
 *   amenities — catalog for amenity matching
 *   lastResult — previous parse result for recognition summary
 *   onSkip() — one-click start-from-scratch
 *   onApply(result) — apply parse + advance
 */
export default function StepImport({
  pasteText,
  setPasteText,
  amenities,
  lastResult,
  onSkip,
  onApply,
}) {
  const t = useTranslations('landlord.listingWizard.paste');
  const [localError, setLocalError] = useState('');

  const charCount = pasteText.length;
  const overCap = charCount > PASTE_MAX_LENGTH;

  const preview = useMemo(() => {
    if (!lastResult) return null;
    return lastResult;
  }, [lastResult]);

  function handleAnalyseAndContinue() {
    setLocalError('');
    const trimmed = (pasteText || '').trim();
    if (!trimmed) {
      onSkip();
      return;
    }
    if (trimmed.length > PASTE_MAX_LENGTH) {
      setLocalError(t('tooLong', { max: PASTE_MAX_LENGTH }));
      return;
    }
    const result = parseListingPaste(trimmed, { amenities });
    onApply(result);
  }

  function handleChange(e) {
    setLocalError('');
    const value = e.target.value;
    // Soft-cap: allow typing up to max; hard reject only on apply
    if (value.length <= PASTE_MAX_LENGTH + 200) {
      setPasteText(value);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="wiz-paste">
          {t('textareaLabel')}
        </label>
        <textarea
          id="wiz-paste"
          rows={10}
          value={pasteText}
          onChange={handleChange}
          className={`${inputClass} resize-y min-h-[12rem] font-sans`}
          placeholder={t('textareaPlaceholder')}
          spellCheck={false}
        />
        <div className="mt-1.5 flex justify-between gap-3">
          <p className="text-xs text-night/50">{t('textareaTip')}</p>
          <span
            className={`text-xs tabular-nums shrink-0 ${
              overCap ? 'text-magenta' : 'text-night/40'
            }`}
          >
            {Math.min(charCount, PASTE_MAX_LENGTH)}
            {charCount > PASTE_MAX_LENGTH ? `+${charCount - PASTE_MAX_LENGTH}` : ''}
            /{PASTE_MAX_LENGTH}
          </span>
        </div>
      </div>

      {localError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-control px-4 py-3">
          {localError}
        </p>
      )}

      {preview && preview.found.length > 0 && (
        <Card tone="parchment" className="p-4 space-y-3">
          <p className="label-caps text-night/70">{t('recognisedLabel')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {preview.found.map((key) => (
              <li key={key}>
                <Pill variant="info">
                  {t(`fields.${PASTE_FIELD_LABEL_KEYS[key] || key}`)}
                </Pill>
              </li>
            ))}
          </ul>
          {preview.missing.filter((k) => k !== 'description').length > 0 && (
            <>
              <p className="label-caps text-night/70 pt-1">{t('missingLabel')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {preview.missing
                  .filter((k) => k !== 'description')
                  .map((key) => (
                    <li key={key}>
                      <Pill variant="amenity">
                        {t(`fields.${PASTE_FIELD_LABEL_KEYS[key] || key}`)}
                      </Pill>
                    </li>
                  ))}
              </ul>
            </>
          )}
          <p className="text-xs text-night/50">{t('suggestionNote')}</p>
        </Card>
      )}

      {preview && preview.found.length === 0 && (pasteText || '').trim() && (
        <Card tone="parchment" className="p-4">
          <p className="text-sm text-night/70">{t('nothingFound')}</p>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between pt-1">
        <Button type="button" variant="outline" onClick={onSkip}>
          <Icon name="arrowRight" className="w-4 h-4" />
          {t('startFromScratch')}
        </Button>
        <Button type="button" variant="primary" onClick={handleAnalyseAndContinue}>
          {(pasteText || '').trim() ? t('useText') : t('continueEmpty')}
        </Button>
      </div>
    </div>
  );
}
