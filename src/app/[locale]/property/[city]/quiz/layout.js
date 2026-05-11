import { getTranslations, setRequestLocale } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Single-locale (Step B, #158): one canonical URL, no language alternates.
export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  const t = await getTranslations({ locale, namespace: 'propylaea.quiz' });
  return {
    title: t('pageTitle'),
    description:
      "Answer a few quick questions and we'll match you with student rentals in Thessaloniki that fit your needs.",
    alternates: {
      canonical: `${SITE_URL}/property/${city}/quiz`,
    },
  };
}

export default async function QuizLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
