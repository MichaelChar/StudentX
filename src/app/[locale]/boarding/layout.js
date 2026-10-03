import { getTranslations } from 'next-intl/server';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

/*
  Share preview. /boarding travels mostly as a pasted link (WhatsApp, parent
  groups, Instagram), so the preview is often the first thing a parent sees.
  Without its own openGraph/twitter blocks it inherited the site default —
  "StudentX · Browse student services by city" over the housing card.

  Next REPLACES a parent's `openGraph` object rather than merging it, so this
  one is complete (siteName, locale, type) instead of only overriding title.

  The image is public/boarding/og.jpg, rendered from en.json by
  scripts/og-boarding.mjs — re-run that after changing the page's copy.
*/
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'boarding.meta' });
  const title = `${t('title')} — StudentX`;
  const description = t('description');
  const url = `${SITE_URL}/boarding`;
  const image = {
    url: `${SITE_URL}/boarding/og.jpg`,
    width: 1200,
    height: 630,
    alt: t('ogImageAlt'),
  };
  return {
    title: t('title'),
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      type: 'website',
      siteName: 'StudentX',
      locale: 'en_GB',
      url,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  };
}

export default function BoardingLayout({ children }) {
  return children;
}
