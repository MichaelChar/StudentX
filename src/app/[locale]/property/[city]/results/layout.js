import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Greek is default at site root (no /el prefix); English at /en. Mirrors
// src/i18n/routing.js. Without these, the locale layout's hreflang points
// at the hub, so /en/property/<city>/results crawls inherit the wrong
// alternates.
export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  const elUrl = `${SITE_URL}/property/${city}/results`;
  const enUrl = `${SITE_URL}/en/property/${city}/results`;
  const t = await getTranslations({ locale, namespace: 'results' });
  return {
    title: t('title'),
    description: locale === 'el'
      ? 'Βρες φοιτητική κατοικία στη Θεσσαλονίκη. Φίλτρα τιμής, τύπου και απόστασης από σχολή.'
      : 'Browse student housing listings in Thessaloniki. Filter by price, property type, and distance to your faculty.',
    alternates: {
      canonical: locale === 'el' ? elUrl : enUrl,
      languages: {
        el: elUrl,
        en: enUrl,
        'x-default': elUrl,
      },
    },
  };
}

export default function ResultsLayout({ children }) {
  return children;
}
