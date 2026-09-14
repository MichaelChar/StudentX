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
export function generateMetadata() {
  return {
    alternates: {
      canonical: `${SITE_URL}/property`,
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
