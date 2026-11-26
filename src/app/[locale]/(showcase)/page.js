import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import ShowcaseHero from '@/components/showcase/ShowcaseHero';
import RenoSweep from '@/components/showcase/RenoSweep';
import VentureTiles from '@/components/showcase/VentureTiles';
import PropertyStrips from '@/components/showcase/PropertyStrips';
import { IMAGES, PROPERTIES } from '@/lib/showcase/properties';
import { stripLabels, ventureTiles } from '@/lib/showcase/copy';
import { showcasePageProps } from '@/lib/showcase';

/*
  The showcase homepage, in the order he signed off (demo v20):
    1. the zoom-through hero onto the London skyline
    2. the full-screen kitchen before/after sweep (no title, no tags)
    3. the manifesto, and nothing else: no figures
    4. the Ventures tile
    5. the Featured properties as vertical number strips, no intro text
  The header stays hidden through 1 and 2 (showcase.css).

  The skyline is a CGI render of a Thames development he did not make: its
  usage rights must be checked before this page goes live (tracked in PR 2).

  Do not read searchParams here: it would opt the page out of prerendering.
*/
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase.meta' });
  return {
    title: { absolute: t('siteTitle') },
    description: t('siteDescription'),
    alternates: { canonical: SITE_URL },
    // openGraph comes whole from the (showcase) layout: a page-level openGraph
    // would replace it, preview image included (metadata merges shallowly).
  };
}

export default async function ShowcaseHome({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  return (
    <div {...showcasePageProps('home')}>
      <ShowcaseHero image={IMAGES.skyline} alt={t('home.skyAlt')} label={t('home.heroLabel')} cue={t('home.cue')} />

      <RenoSweep
        before={IMAGES.kitchenBefore}
        after={IMAGES.kitchenAfter}
        label={t('home.renoLabel')}
        beforeAlt={t('home.renoBeforeAlt')}
        afterAlt={t('home.renoAfterAlt')}
      />

      <section className="sec">
        <div className="in">
          <h2 className="h">{t('home.aboutHeading')}</h2>
          <p className="lead first">{t('manifesto.lead')}</p>
          <p className="lead">{t('manifesto.body')}</p>
          <Link className="more" href="/about-us">
            {t('home.learnMore')}
          </Link>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <h2 className="h">{t('home.venturesHeading')}</h2>
          <VentureTiles tiles={ventureTiles(t)} />
          <Link className="more" href="/ventures">
            {t('home.learnMore')}
          </Link>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <h2 className="h">{t('home.featuredHeading')}</h2>
          <PropertyStrips properties={PROPERTIES} labelFor={stripLabels(t)} playLoader />
          <Link className="more" href="/featured-properties">
            {t('home.exploreFeatured')}
          </Link>
        </div>
      </section>
    </div>
  );
}
