import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gigs.choice' });
  return {
    title: t('title'),
    description: 'Find short-term holiday jobs for students across Europe — paid roles and unpaid internships, filtered by country, start date and length.',
    alternates: {
      canonical: `${SITE_URL}/gigs`,
    },
  };
}

export default function GigsLayout({ children }) {
  return children;
}
