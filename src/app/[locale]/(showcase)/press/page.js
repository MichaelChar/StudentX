import { getTranslations, setRequestLocale } from 'next-intl/server';
import { StudentXWordmark, Mg2Mark } from '@/components/showcase/glyphs';
import { IMAGES } from '@/lib/showcase/properties';
import { showcasePageProps } from '@/lib/showcase';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'showcase' });
  return { title: t('meta.press'), alternates: { canonical: `${SITE_URL}/press` } };
}

export default async function Press({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'showcase' });

  const logos = [
    { kind: 'sx', brand: 'StudentX', colour: t('press.black'), fill: '#0b0b0b', dark: false },
    { kind: 'sx', brand: 'StudentX', colour: t('press.white'), fill: '#ffffff', dark: true },
    { kind: 'sx', brand: 'StudentX', colour: t('press.iris'), fill: '#635BFF', dark: false },
    { kind: 'mg', brand: t('nav.mg2'), colour: t('press.black'), fill: '#0b0b0b', dark: false },
    { kind: 'mg', brand: t('nav.mg2'), colour: t('press.white'), fill: '#ffffff', dark: true },
  ];

  return (
    <div {...showcasePageProps('press')}>
      <div className="in ptitle">
        <h1 className="h">{t('press.title')}</h1>
      </div>
      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="in">
          <p className="press-line">{t('press.line')}</p>
          <p className="email">{t('press.email')}</p>
          <div className="rule-h">
            <h2 className="h sm">{t('press.kit')}</h2>
          </div>
          <div className="kit-logos">
            {logos.map((l) => {
              const Mark = l.kind === 'sx' ? StudentXWordmark : Mg2Mark;
              return (
                <figure key={`${l.kind}-${l.fill}`}>
                  <div className={`tile ${l.kind}${l.dark ? ' dark' : ''}`}>
                    <Mark fill={l.fill} label={t('press.logoLabel', { brand: l.brand, colour: l.colour.toLowerCase() })} />
                  </div>
                  <figcaption className="kit-cap">{t('press.logoCaption', { brand: l.brand, colour: l.colour })}</figcaption>
                </figure>
              );
            })}
          </div>
          <div className="kit-founder">
            <div className="pic">
              {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized */}
              <img src={IMAGES.founder.src} width={IMAGES.founder.w} height={IMAGES.founder.h} alt={t('press.founderName')} loading="lazy" decoding="async" />
            </div>
            <div>
              <h3>{t('press.founderName')}</h3>
              <p className="bio">{t('press.founderShortBio')}</p>
            </div>
          </div>
          <div className="kit-about">
            <div>
              <div className="kit-cap">{t('press.aboutStudentxHeading')}</div>
              <p>{t('press.aboutStudentx')}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
