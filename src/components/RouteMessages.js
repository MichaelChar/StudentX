import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { pickMessages } from '@/lib/pickMessages';

/**
 * Serialises only this route's message namespaces to the browser (#564).
 *
 * Rendered by each route tree's layout rather than once at the root, because
 * one shared allow-list has to be the union of every route's needs — which is
 * how a public listing page came to ship all 398 `landlord.*` keys.
 *
 * use-intl's provider REPLACES the inherited messages rather than merging
 * them, so whatever a subtree needs must be listed in its own set; it cannot
 * lean on the root's. The root set is deliberately tiny (the always-mounted
 * chrome) so that being duplicated under every one of these costs ~2.7 KB.
 *
 * `locale` is passed explicitly, per the convention in CLAUDE.md — never rely
 * on request scope in something rendered inside a guard or redirect branch.
 */
export default async function RouteMessages({ locale, namespaces, children }) {
  const messages = pickMessages(await getMessages(), namespaces);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
