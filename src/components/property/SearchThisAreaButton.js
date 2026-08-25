'use client';

import { useTranslations } from 'next-intl';
import Icon from '@/components/ui/Icon';

export default function SearchThisAreaButton({ visible, onClick, loading = false }) {
  const t = useTranslations('propylaea.results');
  if (!visible) return null;

  const label = t('searchThisArea');
  const loadingLabel = t('searchThisAreaLoading');

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      aria-busy={loading}
      className="absolute top-4 left-1/2 z-[1000] inline-flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-night/10 bg-stone px-4 py-2 text-sm font-semibold text-night shadow-[0_2px_12px_rgba(10,37,64,0.18)] hover:border-night/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name="search" className="h-4 w-4 shrink-0" />
      {/* Stack both labels so the pill width is the longer of the two and
          does not jump when `loading` swaps the visible string. */}
      <span className="grid [grid-template-areas:'stack']">
        <span className={`[grid-area:stack] ${loading ? 'invisible' : ''}`}>
          {label}
        </span>
        <span className={`[grid-area:stack] ${loading ? '' : 'invisible'}`}>
          {loadingLabel}
        </span>
      </span>
    </button>
  );
}
