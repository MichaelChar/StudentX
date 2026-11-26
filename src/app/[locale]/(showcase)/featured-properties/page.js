import { getTranslations, setRequestLocale } from 'next-intl/server';
import FeaturedCard from '@/components/showcase/FeaturedCard';
import { PROPERTIES } from '@/lib/showcase/properties';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return { title: t('meta.featuredProperties'), alternates: { canonical: `${SITE_URL}/featured-properties` } };
}

export default async function FeaturedProperties({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  return (
    <div {...showcasePageProps('featured-properties')}>
      <div className="in ptitle">
        <h1 className="h">{t('featured.title')}</h1>
      </div>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <div className="fgrid">
            {PROPERTIES.map((p) => (
              <FeaturedCard
                key={p.num}
                property={p}
                size={t('featured.size', { size: p.size })}
                layout={t('featured.layout', { layout: p.layout })}
                location={t('featured.location', { neighbourhood: p.neighbourhood })}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
