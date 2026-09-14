import RouteMessages from '@/components/RouteMessages';
import { STUDENT_NAMESPACES } from '@/lib/pickMessages';

// Scopes the client message catalog to the /student tree: account, bookings, chat, practice and the auth pages.
// See src/lib/pickMessages.js for why this is per-route (#564).
export default async function StudentLayout({ children, params }) {
  const { locale } = await params;
  return (
    <RouteMessages locale={locale} namespaces={STUDENT_NAMESPACES}>
      {children}
    </RouteMessages>
  );
}
