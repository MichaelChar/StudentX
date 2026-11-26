import RouteMessages from '@/components/RouteMessages';
import { PROPERTY_PUBLIC_NAMESPACES } from '@/lib/pickMessages';
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
//
// Single-locale (Step B, #158): no `languages` alternates; the canonical
// is the only URL. Pre-Step-B emitted both /property and /en/property
// alternates; with /en/* now 301'd to /*, those alternates would point
// at redirect URLs and pollute the hreflang index.
//
// Title, description and preview are housing's defaults for every /property
// route without its own. They were the site-wide defaults until the homepage
// stopped being housing-first (2026-10-30).
const HOUSING_TITLE = 'StudentX — Student Housing in Thessaloniki';
const HOUSING_DESCRIPTION = 'Find student housing near your university in Thessaloniki.';

export function generateMetadata() {
  return {
    // `absolute`, not `default`: the root layout's template applies to a nested
    // layout's default and would double the suffix.
    title: {
      absolute: HOUSING_TITLE,
      template: '%s — StudentX',
    },
    description: HOUSING_DESCRIPTION,
    alternates: {
      canonical: `${SITE_URL}/property`,
    },
    openGraph: {
      siteName: 'StudentX',
      locale: 'en_GB',
      title: HOUSING_TITLE,
      description: HOUSING_DESCRIPTION,
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          width: 1200,
          height: 630,
          alt: 'StudentX — curated student housing',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: HOUSING_TITLE,
      description: HOUSING_DESCRIPTION,
      images: [`${SITE_URL}/og-default.png`],
    },
  };
}

// Covers /property, every /property/[city] route, AND the landlord dashboard
// beneath it — landlord nests its own provider with the namespaces it needs
// (see property/[city]/landlord/layout.js). That means landlord pages carry
// this set too without using it; accepted, because the alternative is a
// route-group restructure of the whole directory to make the two siblings,
// for ~15 KB on an authenticated page that already loads a listing wizard.
export default async function PropertyLayout({ children, params }) {
  const { locale } = await params;
  return (
    <RouteMessages locale={locale} namespaces={PROPERTY_PUBLIC_NAMESPACES}>
      {children}
    </RouteMessages>
  );
}
