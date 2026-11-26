import { getTranslations, setRequestLocale } from 'next-intl/server';
import VentureTiles from '@/components/showcase/VentureTiles';
import { IMAGES } from '@/lib/showcase/properties';
import { ventureTiles } from '@/lib/showcase/copy';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return { title: t('meta.aboutUs'), alternates: { canonical: `${SITE_URL}/about-us` } };
}

export default async function AboutUs({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  return (
    <div {...showcasePageProps('about-us')}>
      <div className="ch">
        {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized */}
        <img src={IMAGES.skyline.src} width={IMAGES.skyline.w} height={IMAGES.skyline.h} alt="" decoding="async" />
        <div className="in">
          <h1 className="h">{t('about.title')}</h1>
        </div>
      </div>
      <section className="sec">
        <div className="in">
          <p className="lead first">{t('manifesto.lead')}</p>
          <p className="lead">{t('manifesto.body')}</p>
          <div className="rule-h">
            <h2 className="h sm">{t('about.ourVentures')}</h2>
          </div>
          <VentureTiles tiles={ventureTiles(t)} />
        </div>
      </section>
    </div>
  );
}
