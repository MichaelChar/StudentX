const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Default canonical for /property routes. The root [locale]/layout.js sets a
// site-root canonical (https://studentx.uk), which points at a redirect after
// the directory moved under /property — risks Google de-indexing /property in
// favor of a redirect-only URL. Override here so the directory homepage and
// any sub-page that doesn't supply its own canonical (e.g. /property/about)
// inherits a canonical that actually resolves.
//
// Sub-routes with their own layout.js metadata (quiz, results, listing/[id])
// already override this with route-specific URLs.
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const elUrl = `${SITE_URL}/property`;
  const enUrl = `${SITE_URL}/en/property`;
  return {
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

export default function PropertyLayout({ children }) {
  return children;
}
