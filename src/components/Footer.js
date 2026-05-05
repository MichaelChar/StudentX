'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { DEFAULT_CITY } from '@/lib/cityRoutes';

/*
  Propylaea footer — brand column on the left, single Product nav column.
  Programme + Company columns were removed because their target pages
  don't exist yet (per stakeholder direction). Add them back here when
  /programme, /faq, /terms, /privacy ship.

  Multi-city aware: on the city-hub at /property, swap the Thessaloniki
  tagline + Product nav for a panhellenic tagline so the hub doesn't read
  as Thessaloniki-only. Inside any city sub-tree the footer matches the
  pre-multi-city design exactly. The Product nav links use the current
  city extracted from the URL, defaulting to the canonical city for
  non-property pages (e.g. /student/account).
*/
export default function Footer() {
  const t = useTranslations('footer');
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const isOnHub = pathname === '/property';
  const cityMatch = pathname?.match(/^\/property\/([^/]+)/);
  const currentCity = cityMatch?.[1] ?? DEFAULT_CITY;

  return (
    <footer className="bg-night text-stone">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className={isOnHub ? '' : 'grid grid-cols-1 md:grid-cols-3 gap-10'}>
          {/* Brand column */}
          <div className={isOnHub ? '' : 'md:col-span-2'}>
            <p className="font-display text-2xl text-stone mb-3">
              StudentX <span className="text-stone/40">×</span>{' '}
              <span className="italic text-gold">AUSOM</span>
            </p>
            <p className="text-stone/60 text-sm leading-relaxed max-w-md">
              {isOnHub ? t('taglineMultiCity') : t('tagline')}
            </p>
          </div>

          {/* Product column — only inside a city, where these links are meaningful */}
          {!isOnHub && (
            <nav className="flex flex-col gap-3">
              <span className="label-caps text-gold">{t('colProduct')}</span>
              <Link
                href={`/property/${currentCity}/results`}
                className="text-stone/75 hover:text-white transition-colors text-sm"
              >
                {t('listings')}
              </Link>
              <Link
                href={`/property/${currentCity}/quiz`}
                className="text-stone/75 hover:text-white transition-colors text-sm"
              >
                {t('takeTheQuiz')}
              </Link>
              <Link
                href={`/property/${currentCity}/results?view=map`}
                className="text-stone/75 hover:text-white transition-colors text-sm"
              >
                {t('map')}
              </Link>
            </nav>
          )}
        </div>

        <div className="border-t border-stone/10 mt-12 pt-6 text-xs text-stone/50">
          <p>
            {isOnHub ? (
              <>&copy; {year} StudentX</>
            ) : (
              <>
                &copy; {year} StudentX &middot; {t('officialPartner')} &middot;{' '}
                {t('thessaloniki')}
              </>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
