import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import OrnamentRule from '@/components/ui/OrnamentRule';
import Button from '@/components/ui/Button';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  const elUrl = `${SITE_URL}/property/about`;
  const enUrl = `${SITE_URL}/en/property/about`;
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: locale === 'el' ? elUrl : enUrl,
      languages: { el: elUrl, en: enUrl, 'x-default': elUrl },
    },
  };
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AboutContent />;
}

function AboutContent() {
  const t = useTranslations('about');
  const tNav = useTranslations('nav');

  const steps = [
    { numeral: 'Ⅰ', title: t('step1Title'), body: t('step1Body') },
    { numeral: 'Ⅱ', title: t('step2Title'), body: t('step2Body') },
    { numeral: 'Ⅲ', title: t('step3Title'), body: t('step3Body') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-5 pt-20 pb-12 md:pt-28 md:pb-16">
        <p className="label-caps text-gold mb-6">{t('eyebrow')}</p>
        <h1 className="font-display text-4xl md:text-6xl text-night leading-[1.05]">
          {t('titlePrefix')}{' '}
          <span className="italic text-gold">{t('titleItalic')}</span>
        </h1>
        <p className="mt-8 text-night/70 text-lg md:text-xl leading-relaxed max-w-2xl">
          {t('intro')}
        </p>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-4xl px-5 py-16 md:py-20">
        <p className="label-caps text-gold mb-4">{t('missionEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-4xl text-night leading-tight max-w-2xl">
          {t('missionTitle')}
        </h2>
        <p className="mt-6 text-night/70 text-lg leading-relaxed max-w-2xl">
          {t('missionBody')}
        </p>
      </section>

      <div className="mx-auto max-w-4xl px-5">
        <OrnamentRule />
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="label-caps text-gold mb-4">{t('howItWorksEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-4xl text-night leading-tight max-w-2xl">
          {t('howItWorksTitle')}
        </h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((step) => (
            <div key={step.numeral}>
              <span
                className="font-display text-5xl text-gold block leading-none mb-5"
                aria-hidden="true"
              >
                {step.numeral}
              </span>
              <h3 className="font-display text-2xl text-night leading-tight mb-3">
                {step.title}
              </h3>
              <p className="text-night/70 text-base leading-relaxed">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex justify-center">
          <Button href="/property/quiz" variant="primary" size="lg">
            {tNav('takeTheQuiz')}
          </Button>
        </div>
      </section>

      {/* Contact */}
      <section className="mx-auto max-w-4xl px-5 py-16 md:py-20">
        <p className="label-caps text-gold mb-4">{t('contactEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-4xl text-night leading-tight">
          {t('contactTitle')}
        </h2>
        <p className="mt-6 text-night/70 text-lg leading-relaxed max-w-2xl">
          {t('contactBody')}
        </p>
      </section>
    </>
  );
}
