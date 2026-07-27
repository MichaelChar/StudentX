import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import AdmissionsHero from '@/components/admissions/AdmissionsHero';
import CtaButton from '@/components/admissions/CtaButton';
import { CONTACT_EMAIL } from '@/components/admissions/config';

/*
  /admissions — marketing landing page for the medical-school admissions service.

  Server component by design. Every string is read here and passed down as a
  prop, so the `admissions` namespace never needs adding to CLIENT_NAMESPACES
  (src/lib/pickMessages.js) — that list is applied globally in the locale
  layout, so a namespace added there ships on EVERY page of the site, not just
  this one. Prop-drilling is the cheaper trade.

  Do not add `searchParams` to this component: reading it opts the route out of
  prerendering (see open-next.config.ts for why prerendering matters here).
*/

export default async function AdmissionsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'admissions' });

  const steps = [1, 2, 3, 4].map((n) => ({
    n,
    title: t(`steps.s${n}Title`),
    body: t(`steps.s${n}Body`),
  }));

  const stats = [1, 2, 3].map((n) => ({
    n,
    value: t(`proof.stat${n}Value`),
    label: t(`proof.stat${n}Label`),
  }));

  const faqs = [1, 2, 3, 4, 5, 6].map((n) => ({
    n,
    q: t(`faq.q${n}`),
    a: t(`faq.a${n}`),
  }));

  return (
    <>
      <AdmissionsHero
        eyebrow={t('hero.eyebrow')}
        headline={t('hero.headline')}
        subhead={t('hero.subhead')}
        ctaPrimary={t('hero.ctaPrimary')}
        ctaSecondary={t('hero.ctaSecondary')}
      />

      {/* Guarantee — directly below the fold. This is the whole proposition. */}
      <section className="bg-blue text-white">
        <div className="mx-auto max-w-4xl px-5 py-20 md:py-24 text-center">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-white/60">
            {t('guarantee.heading')}
          </p>
          <p className="mt-6 font-display text-2xl md:text-4xl leading-[1.2]">
            {t('guarantee.promise')}
          </p>
          <p className="mt-6 text-base md:text-lg leading-relaxed text-white/80 max-w-2xl mx-auto">
            {t('guarantee.detail')}
          </p>
          <Link
            href="/admissions/terms"
            className="mt-6 inline-block text-sm underline underline-offset-4 text-white/70 hover:text-white"
          >
            {t('guarantee.termsLinkLabel')}
          </Link>
        </div>
      </section>

      {/* Who it's for / not for */}
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-24 grid gap-12 md:grid-cols-2">
          <div>
            <h2 className="font-display text-2xl md:text-3xl text-night">{t('who.heading')}</h2>
            <ul className="mt-6 space-y-4">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-3 text-night/75 leading-relaxed">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-blue" />
                  {t(`who.item${n}`)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-display text-2xl md:text-3xl text-night">{t('who.notForHeading')}</h2>
            <ul className="mt-6 space-y-4">
              {[1, 2].map((n) => (
                <li key={n} className="flex gap-3 text-night/60 leading-relaxed">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-night/25" />
                  {t(`who.notFor${n}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-parchment scroll-mt-8">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-night">{t('steps.heading')}</h2>
          <p className="mt-3 text-night/60 text-lg">{t('steps.subhead')}</p>

          <ol className="mt-12 grid gap-8 sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.n} className="rounded-2xl bg-white p-7 border border-night/10">
                <span className="font-display text-sm font-semibold text-blue">
                  {String(step.n).padStart(2, '0')}
                </span>
                <h3 className="mt-3 font-display text-xl text-night">{step.title}</h3>
                <p className="mt-3 text-night/70 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you get */}
      <section className="bg-stone">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-night">{t('proof.heading')}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.n} className="rounded-2xl bg-parchment p-7">
                <p className="font-display text-4xl text-blue">{stat.value}</p>
                <p className="mt-3 text-sm text-night/70 leading-relaxed">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-xs text-night/45 leading-relaxed max-w-2xl">
            {t('proof.disclaimer')}
          </p>
        </div>
      </section>

      {/* FAQ — <details> keeps it zero-JS, accessible and crawlable. */}
      <section className="bg-parchment">
        <div className="mx-auto max-w-3xl px-5 py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-night">{t('faq.heading')}</h2>
          <div className="mt-10 divide-y divide-night/10 border-y border-night/10">
            {faqs.map((faq) => (
              <details key={faq.n} className="group py-5">
                <summary className="cursor-pointer list-none font-display text-lg text-night flex items-start justify-between gap-4">
                  {faq.q}
                  <span
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-blue transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 text-night/70 leading-relaxed">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-night text-white">
        <div className="mx-auto max-w-3xl px-5 py-20 md:py-24 text-center">
          <h2 className="font-display text-3xl md:text-4xl">{t('cta.heading')}</h2>
          <p className="mt-5 text-lg text-white/70 leading-relaxed">{t('cta.body')}</p>
          <div className="mt-9">
            <CtaButton look="invert">{t('cta.buttonLabel')}</CtaButton>
          </div>
          {/* mailto: silently no-ops without a configured mail client — show the address. */}
          <p className="mt-6 text-sm text-white/50">
            {t('cta.emailFallbackNote', { email: CONTACT_EMAIL })}
          </p>
        </div>
      </section>
    </>
  );
}
