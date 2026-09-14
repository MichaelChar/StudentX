import RouteMessages from '@/components/RouteMessages';
import { ADMIN_NAMESPACES } from '@/lib/pickMessages';

// Scopes the client message catalog to the /admin tree.
// See src/lib/pickMessages.js for why this is per-route (#564).
export default async function AdminLayout({ children, params }) {
  const { locale } = await params;
  return (
    <RouteMessages locale={locale} namespaces={ADMIN_NAMESPACES}>
      {children}
    </RouteMessages>
  );
}
