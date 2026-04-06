import { getTranslations } from 'next-intl/server';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'results' });
  return {
    title: t('title'),
    description: locale === 'el'
      ? 'Βρες φοιτητική κατοικία στη Θεσσαλονίκη. Φίλτρα τιμής, τύπου και απόστασης από σχολή.'
      : 'Browse student housing listings in Thessaloniki. Filter by price, property type, and distance to your faculty.',
  };
}

export default function ResultsLayout({ children }) {
  return children;
}
