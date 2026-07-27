import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/*
  Guarantee terms — placeholder.

  A stub, not a dead link: the hero makes an unconditional-sounding refund
  claim, so pointing it at `#` or a 404 would be worse than pointing it at an
  honest "not published yet". Noindex until it holds real terms.

  BLOCKER BEFORE LAUNCH: this page must define eligibility, what counts as an
  agreed target school, programme requirements, and the refund window before
  the service takes a paying customer.
*/

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'admissions.terms' });
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  };
}

export default async function AdmissionsTermsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'admissions.terms' });

  return (
    <main className="bg-stone min-h-[70svh]">
      <div className="mx-auto max-w-2xl px-5 py-24 md:py-32">
        <h1 className="font-display text-3xl md:text-4xl text-night">{t('title')}</h1>
        <p className="mt-6 text-night/70 leading-relaxed">{t('placeholder')}</p>
        <Link
          href="/admissions"
          className="mt-10 inline-block text-blue underline underline-offset-4 hover:text-night"
        >
          {t('backLabel')}
        </Link>
      </div>
    </main>
  );
}
