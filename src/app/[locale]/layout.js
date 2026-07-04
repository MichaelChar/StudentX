import { Inter, Inter_Tight } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { pickMessages, CLIENT_NAMESPACES } from '@/lib/pickMessages';
import Navbar from '@/components/Navbar';
import SessionSync from '@/components/SessionSync';
import FavoritesProvider from '@/components/FavoritesProvider';
import GigFavoritesProvider from '@/components/GigFavoritesProvider';
import '../globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Single-locale (Step B, #158): canonical is always the site root; no
// language alternates. The `[locale]` route segment is retained in the
// file tree but next-intl injects 'en' silently with `localePrefix:
// 'never'`.

// Inter — display + body face. Greek subset retained because the dormant
// inquiry/digest email templates still have Greek STRINGS branches
// (regression-guard tests pin them). Dropping the subset can wait for
// the follow-up template-strip PR.
const inter = Inter({
  subsets: ['latin', 'greek'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const interTight = Inter_Tight({
  subsets: ['latin'],
  variable: '--font-inter-tight',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Prerendering (SSG) here is only safe because open-next.config.ts sets the
// static-assets incremental cache + cache interception. Without a configured
// incremental cache, prerendered routes on OpenNext + Workers fall back to
// Next's in-memory response cache, which shares render streams across
// requests in the same isolate → "Cannot perform I/O on behalf of a
// different request" → Error 1101 at traffic peaks (2026-07-01/02, PR #316).
// If you remove or change that cache config, re-apply force-dynamic here.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export function generateMetadata() {
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: 'StudentX — Student Housing in Thessaloniki',
      template: '%s — StudentX',
    },
    description: 'Find student housing near your university in Thessaloniki.',
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      siteName: 'StudentX',
      locale: 'en_GB',
      title: 'StudentX',
      description: 'Browse student services by city.',
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
      title: 'StudentX',
      description: 'Browse student services by city.',
      images: [`${SITE_URL}/og-default.png`],
    },
    robots: { index: true, follow: true },
  };
}

// This layout owns the <html>/<body> shell so the lang attribute renders
// server-side from `params.locale` — the root layout (src/app/layout.js)
// can't do this because params aren't available there, and using next-intl's
// getLocale() in the root poisons the per-request config cache.
export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  // Ship only the namespaces client components use to the browser (#260);
  // server components still read the full catalog via getTranslations().
  const messages = pickMessages(await getMessages(), CLIENT_NAMESPACES);

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-stone text-night">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionSync />
          <FavoritesProvider>
            <GigFavoritesProvider>
              <Navbar />
              <main className="flex-1">{children}</main>
            </GigFavoritesProvider>
          </FavoritesProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
