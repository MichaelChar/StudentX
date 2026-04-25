'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { useTransition } from 'react';

/*
  Propylaea locale switcher — renders as "EL / EN" with the active locale
  filled blue, the inactive one ghosted. Matches the design's top-right.
*/
export default function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function switchTo(next) {
    if (next === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  const base =
    'label-caps px-1.5 py-0.5 transition-colors disabled:opacity-50';
  const active = 'text-blue';
  const inactive = 'text-night/40 hover:text-night';

  return (
    <div
      className="inline-flex items-center gap-1 select-none"
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => switchTo('el')}
        disabled={isPending}
        aria-pressed={locale === 'el'}
        className={`${base} ${locale === 'el' ? active : inactive}`}
      >
        EL
      </button>
      <span aria-hidden="true" className="text-night/30">/</span>
      <button
        type="button"
        onClick={() => switchTo('en')}
        disabled={isPending}
        aria-pressed={locale === 'en'}
        className={`${base} ${locale === 'en' ? active : inactive}`}
      >
        EN
      </button>
    </div>
  );
}
