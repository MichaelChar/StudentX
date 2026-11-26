import { getTranslations, setRequestLocale } from 'next-intl/server';
import PropertyMap from '@/components/showcase/PropertyMap';
import { PROPERTIES } from '@/lib/showcase/properties';
import { stripLabels } from '@/lib/showcase/copy';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return { title: t('meta.map'), alternates: { canonical: `${SITE_URL}/map` } };
}

export default async function MapPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  const labels = {
    neighbourhood: t('map.neighbourhood'),
    all: t('map.allNeighbourhoods'),
    view: t('map.view'),
    mapMode: t('map.mapMode'),
    listMode: t('map.listMode'),
    mapLabel: t('map.mapLabel'),
    university: t('map.university'),
  };
  const rowText = Object.fromEntries(
    PROPERTIES.map((p) => [p.num, t('map.row', { neighbourhood: p.neighbourhood, size: p.size })]),
  );
  const cards = Object.fromEntries(
    PROPERTIES.map((p) => [
      p.num,
      {
        size: t('featured.size', { size: p.size }),
        layout: t('featured.layout', { layout: p.layout }),
        location: t('featured.location', { neighbourhood: p.neighbourhood }),
      },
    ]),
  );

  return (
    <div {...showcasePageProps('map')}>
      <div className="in ptitle">
        <h1 className="h">{t('map.title')}</h1>
      </div>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <PropertyMap properties={PROPERTIES} labels={labels} rowText={rowText} cards={cards} pinLabels={stripLabels(t)} />
        </div>
      </section>
    </div>
  );
}
