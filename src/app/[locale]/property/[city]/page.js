import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { isLiveCity, isSupportedCity, getCity } from '@/lib/cityRoutes';
import ThessalonikiLanding from '@/components/property/ThessalonikiLanding';
import ComingSoonCity from '@/components/property/ComingSoonCity';

// City landing — branches on city status. Live cities (currently only
// Thessaloniki) render the full Propylaea landing; coming-soon cities
// render a placeholder hero + mailto CTA. Unsupported slugs 404 (the
// city layout's notFound() check is the canonical guard, but this is
// belt-and-braces for the page-level resolver).
export default async function CityLandingPage({ params }) {
  const { locale, city } = await params;
  setRequestLocale(locale);

  if (!isSupportedCity(city)) {
    notFound();
  }

  if (isLiveCity(city)) {
    return <ThessalonikiLanding />;
  }

  const cityRow = getCity(city);
  return <ComingSoonCity locale={locale} city={cityRow} />;
}
