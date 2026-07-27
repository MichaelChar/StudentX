import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import AdmissionsHero from '@/components/admissions/AdmissionsHero';
import ThreadsStage from '@/components/admissions/ThreadsStage';
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

      {/*
        Guarantee — directly below the fold. This is the whole proposition.
        iris-soft is the palette's designated section-background token; solid
        `bg-blue` reads as an oversized CTA and fights the iris buttons.
      */}
      <section className="bg-iris-soft">
        <div className="mx-auto max-w-4xl px-5 py-20 md:py-24 text-center">
          <p className="font-display text-xs uppercase tracking-[0.2em] text-blue">
            {t('guarantee.heading')}
          </p>
          <p className="mt-6 font-display text-2xl md:text-4xl leading-[1.2] text-night">
            {t('guarantee.promise')}
          </p>
          <p className="mt-6 text-base md:text-lg leading-relaxed text-night/70 max-w-2xl mx-auto">
            {t('guarantee.detail')}
          </p>
          <Link
            href="/admissions/terms"
            className="mt-6 inline-block text-sm underline underline-offset-4 text-night/60 hover:text-blue"
          >
            {t('guarantee.termsLinkLabel')}
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-stone scroll-mt-8">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-night">{t('steps.heading')}</h2>
          <p className="mt-3 text-night/60 text-lg">{t('steps.subhead')}</p>

          <ol className="mt-12 grid gap-8 sm:grid-cols-2">
            {steps.map((step) => (
              <li key={step.n} className="rounded-2xl bg-parchment p-7 border border-night/10">
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
      <section className="bg-parchment">
        <div className="mx-auto max-w-5xl px-5 py-20 md:py-24">
          <h2 className="font-display text-3xl md:text-4xl text-night">{t('proof.heading')}</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.n} className="rounded-2xl bg-white p-7">
                <p className="font-display text-4xl text-blue">{stat.value}</p>
                <p className="mt-3 text-sm text-night/70 leading-relaxed">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ — <details> keeps it zero-JS, accessible and crawlable. */}
      <section className="bg-stone">
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

      {/* Closing CTA — same stage as the hero, shader flipped to bookend it. */}
      <ThreadsStage flip scrim="center" className="text-white">
        <div className="mx-auto max-w-3xl px-5 py-24 md:py-28 text-center">
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
      </ThreadsStage>
    </>
  );
}
