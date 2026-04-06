import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'about' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
  };
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AboutContent />;
}

function AboutContent() {
  const t = useTranslations('about');

  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="font-heading text-3xl font-bold text-navy mb-6">
        {t('title')}
      </h1>

      <p className="text-gray-dark/80 text-lg leading-relaxed mb-8">
        {t('intro')}
      </p>

      <div className="space-y-10">
        <section>
          <h2 className="font-heading text-xl font-semibold text-navy mb-3">
            {t('missionTitle')}
          </h2>
          <p className="text-gray-dark/70 leading-relaxed">
            {t('missionBody')}
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-navy mb-3">
            {t('howItWorksTitle')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {['step1', 'step2', 'step3'].map((step) => (
              <div key={step} className="bg-gray-light/40 rounded-xl p-5">
                <div className="font-heading font-semibold text-navy mb-1">
                  {t(`${step}Title`)}
                </div>
                <p className="text-gray-dark/60 text-sm">
                  {t(`${step}Body`)}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-navy mb-3">
            {t('forLandlordsTitle')}
          </h2>
          <p className="text-gray-dark/70 leading-relaxed">
            {t('forLandlordsBody')}
          </p>
        </section>

        <section>
          <h2 className="font-heading text-xl font-semibold text-navy mb-3">
            {t('contactTitle')}
          </h2>
          <p className="text-gray-dark/70 leading-relaxed">
            {t('contactBody')}
          </p>
        </section>
      </div>
    </div>
  );
}
