import { setRequestLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://studentx.uk';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'manifesto' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE_URL}/about`,
    },
  };
}

export default async function AboutPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'manifesto' });

  return (
    <main className="bg-stone">
      <article className="mx-auto max-w-[720px] px-4 py-16 sm:px-6 sm:py-24">
        <p className="label-caps text-blue">{t('eyebrow')}</p>
        <h1 className="mt-4 font-display text-[clamp(2rem,5vw,3.25rem)] font-bold leading-[1.08] tracking-tight text-night">
          {t('titleLead')} <span className="text-blue">{t('titleAccent')}</span>
        </h1>
        <p className="mt-5 text-lg text-night/70">{t('sub')}</p>
        <div
          aria-hidden="true"
          className="mt-8 h-1 w-14 rounded-full"
          style={{ background: 'var(--gradient-brand)' }}
        />

        <p className="mt-10 text-2xl leading-snug text-night">{t('lede')}</p>
        <p className="mt-6 text-lg leading-relaxed text-night/70">{t('body')}</p>

        <blockquote className="relative my-12 border-y border-night/10 py-10">
          <span
            aria-hidden="true"
            className="absolute -top-1 left-0 font-display text-7xl leading-none text-magenta"
          >
            “
          </span>
          <p className="pt-8 font-display text-2xl font-bold leading-snug text-blue sm:text-3xl">
            {t('quote')}
          </p>
        </blockquote>

        <p className="text-lg leading-relaxed text-night/70">{t('closing')}</p>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-display text-xl font-bold text-night">{t('signatureName')}</p>
            <p className="text-sm text-night/70">{t('signatureRole')}</p>
          </div>
          <p className="rounded-full bg-parchment px-4 py-2 text-sm text-night/70">
            {t('partner')}
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/property/thessaloniki"
            className="rounded-full bg-blue px-6 py-3 font-semibold text-white"
          >
            {t('browse')}
          </Link>
          <Link
            href="/"
            className="rounded-full border border-night/20 px-6 py-3 font-semibold text-night"
          >
            {t('explore')}
          </Link>
        </div>

        <p className="mt-16 text-center text-xs text-night/70">
          {t('copyright', { year: new Date().getFullYear() })}
        </p>
      </article>
    </main>
  );
}
