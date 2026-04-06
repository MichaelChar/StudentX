import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.gr';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: 'StudentX — Φοιτητικές Κατοικίες Θεσσαλονίκη',
      template: '%s — StudentX',
    },
    description:
      'Βρες φοιτητική κατοικία κοντά στο πανεπιστήμιό σου στη Θεσσαλονίκη. | Find student housing near your university in Thessaloniki.',
    alternates: {
      canonical: `${SITE_URL}/${locale}`,
      languages: {
        el: `${SITE_URL}/el`,
        en: `${SITE_URL}/en`,
        'x-default': `${SITE_URL}`,
      },
    },
    openGraph: {
      siteName: 'StudentX',
      locale: locale === 'el' ? 'el_GR' : 'en_US',
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
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </NextIntlClientProvider>
  );
}
