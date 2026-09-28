import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

/*
  Rendered by notFound() in ./page.js for an unknown or inactive gig, with a
  404 status. Same copy the page used to render inline with a 200.

  A not-found file receives no params, so the locale comes from routing —
  single-locale site, and explicit per the getTranslations convention in
  CLAUDE.md rather than leaning on request scope.
*/
export default async function GigNotFound() {
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: 'gigs.detail' });
  return (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <p className="font-display text-2xl text-night">{t('notFound')}</p>
      <Link href="/gigs" className="mt-4 inline-block text-blue hover:underline">
        {t('browseAll')}
      </Link>
    </div>
  );
}
