'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';

export default function MapAreaEmptyState({ onReset }) {
  const t = useTranslations('propylaea.results');

  return (
    <div className="py-20 text-center">
      <p className="mb-2 font-display text-2xl text-night">
        {t('mapEmptyTitle')}
      </p>
      <p className="mb-6 text-night/60">{t('mapEmptyBody')}</p>
      <Button type="button" variant="primary" onClick={onReset}>
        {t('mapEmptyAction')}
      </Button>
    </div>
  );
}
