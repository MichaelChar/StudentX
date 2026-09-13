import RouteMessages from '@/components/RouteMessages';
import { PROPERTY_LANDLORD_NAMESPACES } from '@/lib/pickMessages';

// Scopes the client message catalog to the landlord dashboard tree. Nested inside property/layout.js, so this replaces (does NOT merge with) the public property set above it — everything the dashboard, wizard and inquiry chat need must be listed in PROPERTY_LANDLORD_NAMESPACES.
// See src/lib/pickMessages.js for why this is per-route (#564).
export default async function LandlordTreeLayout({ children, params }) {
  const { locale } = await params;
  return (
    <RouteMessages locale={locale} namespaces={PROPERTY_LANDLORD_NAMESPACES}>
      {children}
    </RouteMessages>
  );
}
