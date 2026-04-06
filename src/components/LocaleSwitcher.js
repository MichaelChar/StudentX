'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';

export default function LocaleSwitcher() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchLocale(nextLocale) {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  const nextLocale = locale === 'en' ? 'el' : 'en';
  const label = locale === 'en' ? t('switchToEl') : t('switchToEn');

  return (
    <button
      onClick={() => switchLocale(nextLocale)}
      disabled={isPending}
      className="text-sm font-medium text-gray-dark/60 hover:text-navy transition-colors px-2 py-1 rounded-md hover:bg-gray-light disabled:opacity-50 cursor-pointer"
      aria-label={`Switch to ${nextLocale === 'el' ? 'Greek' : 'English'}`}
    >
      {label}
    </button>
  );
}
