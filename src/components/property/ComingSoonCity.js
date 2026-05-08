import { getTranslations } from 'next-intl/server';
import Button from '@/components/ui/Button';
import OrnamentRule from '@/components/ui/OrnamentRule';
import { CITY_ACCENTS } from '@/lib/cityRoutes';

// Per-city placeholder for cities listed on the hub but without a real
// directory yet. Uses the city's accent palette (CITY_ACCENTS) for the
// hero band so each city feels distinct even without listings; everything
// else stays in the Propylaea aesthetic so it reads as part of the
// city-directory brand layer (not the hub's stripe theme).
export default async function ComingSoonCity({ locale, city }) {
  const t = await getTranslations({ locale, namespace: 'propylaea.comingSoon' });
  const accent = CITY_ACCENTS[city?.accent] || CITY_ACCENTS.thessaloniki;
  const cityName = city?.name || '';
  const mailto = `mailto:hello@studentx.uk?subject=${encodeURIComponent(
    `Landlord interest — ${cityName}`,
  )}`;

  return (
    <>
      {/* Hero — city accent band */}
      <section
        className="relative overflow-hidden"
        style={{ background: accent.bg }}
      >
        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <p
            className="label-caps mb-8"
            style={{ color: accent.ink }}
          >
            {t('eyebrow')}
          </p>
          <h1
            className="font-display text-4xl md:text-6xl lg:text-[4.5rem] leading-[1.05] max-w-3xl"
            style={{ color: accent.ink }}
          >
            {t('titlePrefix')}{' '}
            <span className="italic">{cityName}.</span>
          </h1>
          <p
            className="mt-6 max-w-xl text-lg md:text-xl leading-relaxed"
            style={{ color: accent.ink, opacity: 0.75 }}
          >
            {t('subtitle', { city: cityName })}
          </p>
        </div>
      </section>

      {/* Body — call to action */}
      <section className="mx-auto max-w-3xl px-5 py-20 md:py-24 text-center">
        <p className="label-caps text-yellow mb-5">{t('ctaEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-5xl text-night leading-tight">
          {t('ctaTitle')}
        </h2>
        <p className="mt-6 max-w-xl mx-auto text-night/70 text-base leading-relaxed">
          {t.rich('ctaBody', {
            city: cityName,
            link: (chunks) => (
              <a
                href={mailto}
                className="text-blue underline underline-offset-2 hover:text-night transition-colors"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <div className="mt-10">
          <Button href={mailto} variant="primary" size="lg">
            {t('ctaButton', { city: cityName })}
          </Button>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 pb-12">
        <OrnamentRule />
      </div>
    </>
  );
}
