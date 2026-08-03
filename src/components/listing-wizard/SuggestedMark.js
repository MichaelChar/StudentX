'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';

/**
 * Inline "from your text" mark next to a pre-filled wizard field.
 * Dismiss clears the suggestion (caller clears value + mark).
 */
export default function SuggestedMark({ show, onDismiss, className = '' }) {
  const t = useTranslations('landlord.listingWizard.paste');
  if (!show) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 ml-2 align-middle ${className}`}
    >
      <span className="text-[0.65rem] font-sans font-semibold uppercase tracking-[0.12em] text-blue">
        {t('fromText')}
      </span>
      {onDismiss && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            onDismiss();
          }}
          className="p-0.5 text-night/40 hover:text-night rounded-sm"
          aria-label={t('dismissSuggestion')}
        >
          <Icon name="x" className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
