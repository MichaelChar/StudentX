import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/*
  404 inside the showcase (a property number that doesn't exist, say), in the
  showcase's own chrome. `locale` can't come from params here (not-found gets
  none); the site has one locale, so it is named outright, per the explicit-
  locale convention in CLAUDE.md.

  Unknown URLs land here too, through (showcase)/[...rest]. A notFound() inside
  a parked platform route still uses (platform)/not-found.js, but those routes
  redirect before rendering while the showcase is live.
*/
export default async function ShowcaseNotFound() {
  const t = await getTranslations({ locale: 'en', namespace: 'showcase.notFound' });
  return (
    <div className="in ptitle sec">
      <h1 className="h">{t('title')}</h1>
      <p className="lead">{t('body')}</p>
      <Link className="more" href="/">
        {t('home')}
      </Link>
    </div>
  );
}
