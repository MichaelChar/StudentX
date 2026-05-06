import { Inter } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SessionSync from '@/components/SessionSync';
import '../globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

// Greek is the default locale and lives at the site root (no /el prefix);
// English lives under /en. Keep these helpers in lockstep with `routing` in
// src/i18n/routing.js (defaultLocale: 'el', localePrefix: 'as-needed').
const localeUrl = (locale) =>
  locale === 'el' ? SITE_URL : `${SITE_URL}/${locale}`;

const META_BY_LOCALE = {
  el: {
    title: 'StudentX — Φοιτητικές Κατοικίες Θεσσαλονίκη',
    description:
      'Βρες φοιτητική κατοικία κοντά στο πανεπιστήμιό σου στη Θεσσαλονίκη.',
    ogLocale: 'el_GR',
  },
  en: {
    title: 'StudentX — Student Housing in Thessaloniki',
    description: 'Find student housing near your university in Thessaloniki.',
    ogLocale: 'en_GB',
  },
};

// Inter — display + body face (Latin + Greek subsets)
const inter = Inter({
  subsets: ['latin', 'greek'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const meta = META_BY_LOCALE[locale] || META_BY_LOCALE.el;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: meta.title,
      template: '%s — StudentX',
    },
    description: meta.description,
    alternates: {
      canonical: localeUrl(locale),
      languages: {
        el: localeUrl('el'),
        en: localeUrl('en'),
        'x-default': localeUrl('el'),
      },
    },
    openGraph: {
      siteName: 'StudentX',
      locale: meta.ogLocale,
      images: [
        {
          url: `${SITE_URL}/og-default.png`,
          alt: 'StudentX — student housing in Thessaloniki',
        },
      ],
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
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-stone text-night">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionSync />
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
