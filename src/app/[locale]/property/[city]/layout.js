import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { isSupportedCity } from '@/lib/cityRoutes';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Per-city canonical metadata. The parent [locale]/property/layout.js sets a
// canonical for /property (the central city-hub); this layout overrides it
// for any sub-route under /property/[city] so Google indexes the city
// directory at its city-specific URL rather than the hub.
//
// Sub-routes with their own layout.js (quiz, results, listing/[id]) will
// override this again with route-specific URLs.
export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  if (!isSupportedCity(city)) return {};
  const elUrl = `${SITE_URL}/property/${city}`;
  const enUrl = `${SITE_URL}/en/property/${city}`;
  return {
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

export default async function CityLayout({ children, params }) {
  const { locale, city } = await params;
  if (!isSupportedCity(city)) notFound();
  setRequestLocale(locale);
  return children;
}
