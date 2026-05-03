import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import SessionSync from '@/components/SessionSync';

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

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;

  if (!routing.locales.includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionSync />
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </NextIntlClientProvider>
  );
}
