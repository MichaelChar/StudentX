import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Single-locale (Step B, #158): one canonical URL, no language alternates.
export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  const t = await getTranslations({ locale, namespace: 'results' });
  return {
    title: t('title'),
    description: 'Browse student housing listings in Thessaloniki. Filter by price, property type, and distance to your faculty.',
    alternates: {
      canonical: `${SITE_URL}/property/${city}/results`,
    },
  };
}

export default function ResultsLayout({ children }) {
  return children;
}
