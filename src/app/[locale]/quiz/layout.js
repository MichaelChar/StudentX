import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.gr';

// Greek is default at site root (no /el prefix); English at /en. Without
// these, the locale layout's hreflang on /en/quiz points at the homepages
// instead of the localized quiz pages, so SEO loses the alternate signal.
const elUrl = `${SITE_URL}/quiz`;
const enUrl = `${SITE_URL}/en/quiz`;

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'propylaea.quiz' });
  return {
    title: t('pageTitle'),
    description:
      locale === 'el'
        ? 'Απάντησε σε λίγες ερωτήσεις και βρες φοιτητικά διαμερίσματα στη Θεσσαλονίκη που ταιριάζουν στις ανάγκες σου.'
        : 'Answer a few quick questions and we\'ll match you with student rentals in Thessaloniki that fit your needs.',
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

export default function QuizLayout({ children }) {
  return children;
}
