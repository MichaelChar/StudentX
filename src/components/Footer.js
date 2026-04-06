'use client';

import { useTranslations } from 'next-intl';

export default function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="bg-midnight text-white">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <p className="font-heading text-lg font-bold tracking-tight mb-2">StudentX</p>
        <p className="text-white/50 text-sm max-w-xs">
          {t('tagline')}
        </p>
        <div className="border-t border-white/10 mt-10 pt-6">
          <p className="text-white/30 text-xs tracking-wide">
            &copy; {new Date().getFullYear()} StudentX. {t('rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
