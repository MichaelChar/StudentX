import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Mg2Mark } from '@/components/showcase/glyphs';
import { IMAGES } from '@/lib/showcase/properties';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return { title: t('meta.ventures'), alternates: { canonical: `${SITE_URL}/ventures` } };
}

export default async function Ventures({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  return (
    <div {...showcasePageProps('ventures')}>
      <div className="in ptitle">
        <h1 className="h">{t('ventures.title')}</h1>
      </div>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <section className="venture">
            <div className="vlogo">
              <Mg2Mark label={t('nav.mg2')} />
            </div>
            <div className="vbody">
              <div className="vimg">
                {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized */}
                <img src={IMAGES.mg2.src} width={IMAGES.mg2.w} height={IMAGES.mg2.h} alt="" loading="lazy" decoding="async" />
              </div>
              <div className="src">{t('ventures.mg2Kind')}</div>
              <p>{t('ventures.mg2Line')}</p>
              <div className="links">
                <Link className="more" href="/mg2">
                  {t('ventures.visit', { venture: t('nav.mg2') })}
                </Link>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
