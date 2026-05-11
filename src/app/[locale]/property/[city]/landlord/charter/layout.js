import { getTranslations, setRequestLocale } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  const t = await getTranslations({ locale, namespace: 'propylaea.charter' });
  return {
    title: t('pageTitle'),
    description: 'Founding landlord offer — 50 spots, the first 5 at 80% off SuperLandlord tier.',
    alternates: {
      canonical: `${SITE_URL}/property/${city}/landlord/charter`,
    },
  };
}

export default async function CharterLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
