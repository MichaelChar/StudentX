'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

/*
  Propylaea footer — brand column on the left, single Product nav column.
  Programme + Company columns were removed because their target pages
  don't exist yet (per stakeholder direction). Add them back here when
  /programme, /faq, /terms, /privacy ship.
*/
export default function Footer() {
  const t = useTranslations('footer');
  const year = new Date().getFullYear();

  return (
    <footer className="bg-night text-stone">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Brand column */}
          <div className="md:col-span-2">
            <p className="font-display text-2xl text-stone mb-3">
              StudentX <span className="text-stone/40">×</span>{' '}
              <span className="italic text-gold">AUSOM</span>
            </p>
            <p className="text-stone/60 text-sm leading-relaxed max-w-md">
              {t('tagline')}
            </p>
          </div>

          {/* Product column */}
          <nav className="flex flex-col gap-3">
            <span className="label-caps text-gold">{t('colProduct')}</span>
            <Link
              href="/property/results"
              className="text-stone/75 hover:text-white transition-colors text-sm"
            >
              {t('listings')}
            </Link>
            <Link
              href="/property/quiz"
              className="text-stone/75 hover:text-white transition-colors text-sm"
            >
              {t('takeTheQuiz')}
            </Link>
            <Link
              href="/property/results?view=map"
              className="text-stone/75 hover:text-white transition-colors text-sm"
            >
              {t('map')}
            </Link>
          </nav>
        </div>

        <div className="border-t border-stone/10 mt-12 pt-6 text-xs text-stone/50">
          <p>
            &copy; {year} StudentX &middot; {t('officialPartner')} &middot;{' '}
            {t('thessaloniki')}
          </p>
        </div>
      </div>
    </footer>
  );
}
