import RouteMessages from '@/components/RouteMessages';
import { AUTH_NAMESPACES } from '@/lib/pickMessages';

// Scopes the client message catalog to the unified /login and /signup pages.
// See src/lib/pickMessages.js for why this is per-route (#564).
export default async function AuthLayout({ children, params }) {
  const { locale } = await params;
  return (
    <RouteMessages locale={locale} namespaces={AUTH_NAMESPACES}>
      {children}
    </RouteMessages>
  );
}
