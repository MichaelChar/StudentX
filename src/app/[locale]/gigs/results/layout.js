import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gigs.results' });
  return {
    title: t('title'),
    description: 'Browse short-term holiday jobs for students across Europe. Filter by paid or unpaid, country, start date and length.',
    alternates: {
      canonical: `${SITE_URL}/gigs/results`,
    },
  };
}

export default function GigsResultsLayout({ children }) {
  return children;
}
