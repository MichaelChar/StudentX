import { getTranslations, setRequestLocale } from 'next-intl/server';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OrnamentRule from '@/components/ui/OrnamentRule';
import { propertyHref, SUPPORTED_CITIES } from '@/lib/cityRoutes';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Override the locale layout's Thessaloniki-anchored title/description for
// the multi-city hub. The parent [locale]/layout.js sets a default like
// "StudentX — Φοιτητικές Κατοικίες Θεσσαλονίκη" which is correct for the
// city landing but contradicts the hub's "across Greece" promise. Use
// title.absolute to bypass the parent's "%s — StudentX" template.
const HUB_META = {
  el: {
    title: 'StudentX — Φοιτητική στέγη σε όλη την Ελλάδα',
    ogAlt: 'StudentX — επιμελημένη φοιτητική στέγη σε ελληνικές πόλεις',
  },
  en: {
    title: 'StudentX — Curated student housing across Greece',
    ogAlt: 'StudentX — curated student housing across Greek cities',
  },
};

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'propylaea.cityHub' });
  const meta = HUB_META[locale] || HUB_META.el;
  const description = t('subtitle');
  return {
    title: { absolute: meta.title },
    description,
    openGraph: {
      title: meta.title,
      description,
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          alt: meta.ogAlt,
        },
      ],
    },
  };
}

// Multi-city hub at /property — the entry point for visitors before they
// pick a city. Today only Thessaloniki is live; this page lists the active
// cities as cards plus a "more coming" placeholder. The parent
// [locale]/property/layout.js handles the canonical metadata for /property.
//
// Each [city] sub-tree (e.g. /property/thessaloniki) keeps the existing
// Propylaea landing + results + quiz + listing flow untouched. Phase 2
// generalises the data model so a second city can be added.
export default async function PropertyHubPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'propylaea.cityHub' });

  return (
    <>
      {/* Hero */}
      <section className="relative bg-night text-stone overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-gold/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-blue/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <p className="label-caps text-gold mb-8">{t('eyebrow')}</p>
          <h1 className="font-display text-4xl md:text-6xl lg:text-[4.5rem] leading-[1.05] max-w-3xl">
            {t('heroBefore')}{' '}
            <span className="italic text-gold">{t('heroItalic')}</span>{' '}
            {t('heroAfter')}
          </h1>
          <p className="mt-6 max-w-xl text-stone/70 text-lg md:text-xl leading-relaxed">
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* City grid */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <p className="label-caps text-gold mb-5">{t('citiesEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-5xl text-night leading-tight max-w-3xl">
          {t('citiesTitle')}{' '}
          <span className="italic text-gold">{t('citiesTitleItalic')}</span>
        </h2>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SUPPORTED_CITIES.map((slug) => (
            <Card key={slug} tone="parchment" border={false} className="px-6 py-8">
              <p className="label-caps text-night/50 mb-2">{t(`${slug}.greek`)}</p>
              <h3 className="font-display text-3xl text-night leading-tight mb-3">
                {t(`${slug}.name`)}
              </h3>
              <p className="text-night/70 text-base leading-relaxed mb-6">
                {t(`${slug}.description`)}
              </p>
              <Button href={propertyHref(slug)} variant="primary" size="md">
                {t(`${slug}.cta`)}
              </Button>
            </Card>
          ))}

          <Card tone="stone" border={false} className="px-6 py-8">
            <p className="label-caps text-night/50 mb-2">{t('comingSoonEyebrow')}</p>
            <h3 className="font-display text-3xl text-night leading-tight mb-3">
              {t('comingSoonTitle')}
            </h3>
            <p className="text-night/70 text-base leading-relaxed">
              {t.rich('comingSoonBody', {
                link: (chunks) => (
                  <a
                    href="mailto:hello@studentx.uk?subject=City%20request"
                    className="text-blue underline underline-offset-2 hover:text-night transition-colors"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </Card>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5">
        <OrnamentRule />
      </div>
    </>
  );
}
