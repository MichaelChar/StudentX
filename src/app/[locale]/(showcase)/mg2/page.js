import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Mg2Mark } from '@/components/showcase/glyphs';
import PropertyStrips from '@/components/showcase/PropertyStrips';
import { IMAGES, PROPERTIES } from '@/lib/showcase/properties';
import { stripLabels } from '@/lib/showcase/copy';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return {
    title: t('meta.mg2'),
    description: t('meta.mg2Description'),
    alternates: { canonical: `${SITE_URL}/mg2` },
  };
}

export default async function Mg2({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  return (
    <div {...showcasePageProps('mg2')}>
      <div className="ch">
        {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized */}
        <img src={IMAGES.mg2.src} width={IMAGES.mg2.w} height={IMAGES.mg2.h} alt="" decoding="async" />
        <div className="in">
          <h1 className="mgmark">
            <Mg2Mark label={t('nav.mg2')} />
          </h1>
        </div>
      </div>
      <section className="sec">
        <div className="in">
          <p className="lead first">{t('mg2.lead')}</p>
          <p className="lead">{t('mg2.body')}</p>
          <div className="stats">
            <div className="stat">
              <p>{t('mg2.statFamily')}</p>
              <div className="fig">
                <span className="num">{t('mg2.statFamilyNum')}</span>
                <span className="unit">{t.rich('mg2.statFamilyUnit', { br: () => <br /> })}</span>
              </div>
            </div>
            <div className="stat">
              <p>{t('mg2.statPipeline')}</p>
              <div className="fig">
                <span className="num">{t('mg2.statPipelineNum')}</span>
              </div>
            </div>
          </div>
          <div className="rule-h">
            <h2 className="h sm">{t('mg2.featuredHeading')}</h2>
          </div>
          <PropertyStrips properties={PROPERTIES} labelFor={stripLabels(t)} />
          <div className="links-row">
            <Link className="more" href="/map">
              {t('mg2.mapLink')}
            </Link>
            <Link className="more" href="/featured-properties">
              {t('mg2.featuredLink')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
