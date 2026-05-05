import { getTranslations, setRequestLocale } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale, city } = await params;
  const elUrl = `${SITE_URL}/property/${city}/landlord/charter`;
  const enUrl = `${SITE_URL}/en/property/${city}/landlord/charter`;
  const t = await getTranslations({ locale, namespace: 'propylaea.charter' });
  return {
    title: t('pageTitle'),
    description:
      locale === 'el'
        ? 'Ιδρυτική προσφορά για ιδιοκτήτες ακινήτων — 50 θέσεις, οι πρώτοι 5 με 80% έκπτωση στο SuperLandlord.'
        : 'Founding landlord offer — 50 spots, the first 5 at 80% off SuperLandlord tier.',
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

export default async function CharterLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
