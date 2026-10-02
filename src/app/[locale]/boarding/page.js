import { setRequestLocale, getTranslations } from 'next-intl/server';
import { HeaderSlot } from '@/components/HeaderSlot';
import { CalLoader, CalButton } from '@/components/boarding/CalBooking';
import Portrait from '@/components/boarding/Portrait';
import {
  CONTACT_EMAIL,
  PHONE_DISPLAY,
  WHATSAPP_URL,
} from '@/components/boarding/config';

/*
  /boarding — Swiss boarding school placement landing page.

  Built from the founder-approved layout (boarding.html, 2026-10). Copy is
  LOCKED: every string lives in en.json under `boarding` and is the approved
  wording verbatim — including its lowercase hero headline and section labels.
  Do not "fix" the casing or punctuation.

  Server component, same shape as /admissions: strings are read here and
  passed down as props, so no client message namespace is needed. Do not read
  `searchParams` here — it would opt the route out of prerendering.

  Styled to the site, not the design file, where the two disagreed (founder's
  call, 2026-10-02): Inter headings in the site's display style, flat 8px
  buttons matching ui/Button's primary look, the site's own header, footer
  line and mobile tab bar.
*/

const MUTED = 'text-[#5c6b80]';
const WRAP = 'mx-auto w-full max-w-[1120px] px-5';
const DISPLAY = 'font-display leading-[1.08]';
const H2 = `${DISPLAY} mb-4 text-[clamp(2rem,3.6vw,3.15rem)]`;
const LABEL = 'mb-2.5 text-[13px] font-bold tracking-[0.02em] text-blue';
// Mirrors ui/Button (primary, md). Not that component itself: it renders
// next-intl's <Link>, and these are external links with a click intercept.
const BTN =
  'inline-flex items-center justify-center gap-2 rounded-control px-5 py-3 ' +
  'text-sm font-sans font-semibold leading-normal no-underline cursor-pointer border ' +
  'transition-[background-color,border-color,color] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue';
const BTN_PRIMARY = `${BTN} bg-blue text-white border-blue hover:bg-blue/90 active:bg-blue/80`;
const BTN_ON_BLUE = `${BTN} bg-white text-night border-white hover:bg-parchment`;
const SPLIT = 'grid items-center gap-12';
const PANEL = 'rounded-[28px] bg-parchment p-9';

export default async function BoardingPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'boarding' });

  const chips = [1, 2, 3].map((n) => ({
    n,
    title: t(`chips.c${n}Title`),
    body: t(`chips.c${n}Body`),
  }));

  const steps = [1, 2, 3].map((n) => ({
    n,
    title: t(`steps.s${n}Title`),
    body: t(`steps.s${n}Body`),
  }));

  return (
    <div className="text-[17px] leading-[1.65] text-night">
      <CalLoader />

      {/* Header CTA — rendered into the global header's slot. Below 980px the
          sticky bar at the foot of the page takes over, as in the design. */}
      <HeaderSlot>
        <div className="hidden w-full justify-end min-[980px]:flex">
          <CalButton className={BTN_PRIMARY}>{t('headerCta')}</CalButton>
        </div>
      </HeaderSlot>

      {/* Hero */}
      <section className="pt-9 pb-7 min-[980px]:pt-[72px]">
        <div className={`${WRAP} grid items-center gap-7 min-[980px]:grid-cols-[1.15fr_0.85fr] min-[980px]:gap-14`}>
          <div>
            <h1 className={`${DISPLAY} mb-[18px] text-[clamp(2.5rem,5.4vw,4.4rem)]`}>
              {t('hero.headline')}
            </h1>
            <p className={`max-w-[38rem] text-[1.08rem] ${MUTED}`}>{t('hero.body')}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <CalButton className={BTN_PRIMARY}>
                {t('hero.cta')}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                  className="h-4 w-4"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </CalButton>
            </div>
          </div>
          <div className="order-first flex justify-center min-[980px]:order-none">
            <Portrait alt={t('hero.photoAlt')} priority />
          </div>
        </div>
      </section>

      {/* Credibility chips */}
      <div className={WRAP}>
        <div className="grid gap-3 pt-7 pb-2.5 min-[980px]:grid-cols-3">
          {chips.map((chip) => (
            <div key={chip.n} className="rounded-2xl bg-parchment px-4 pt-4 pb-3.5">
              <strong className="block text-[15px] font-bold tracking-[-0.02em]">{chip.title}</strong>
              <span className={`mt-1 block text-[13px] ${MUTED}`}>{chip.body}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pathway */}
      <section className="py-[72px]">
        <div className={`${WRAP} ${SPLIT} min-[980px]:grid-cols-[0.9fr_1.1fr]`}>
          <div>
            <p className={LABEL}>{t('pathway.label')}</p>
            <h2 className={H2}>{t('pathway.heading')}</h2>
          </div>
          <div className={PANEL}>
            <p>{t('pathway.body')}</p>
          </div>
        </div>
      </section>

      {/* The uncomfortable truth — panel first, as in the design. */}
      <section className="pb-[72px]">
        <div className={`${WRAP} ${SPLIT} min-[980px]:grid-cols-[1.1fr_0.9fr]`}>
          <div className={PANEL}>
            <p>{t('truth.body')}</p>
          </div>
          <div>
            <p className={LABEL}>{t('truth.label')}</p>
            <h2 className={H2}>{t('truth.heading')}</h2>
          </div>
        </div>
      </section>

      {/* Meet your guide */}
      <section className="bg-parchment py-[72px]">
        <div className={`${WRAP} ${SPLIT} min-[980px]:grid-cols-[1.1fr_0.9fr]`}>
          <div>
            <p className={LABEL}>{t('guide.label')}</p>
            <h2 className={H2}>{t('guide.heading')}</h2>
            <p className={`max-w-[38rem] text-[1.08rem] ${MUTED}`}>{t('guide.body')}</p>
          </div>
          <div className="order-first flex justify-center min-[980px]:order-none">
            <Portrait alt={t('hero.photoAlt')} />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pt-2.5 pb-[72px]">
        <div className={WRAP}>
          <p className={LABEL}>{t('steps.label')}</p>
          <h2 className={H2}>{t('steps.heading')}</h2>
          <ol className="mt-7 grid gap-[18px] min-[980px]:grid-cols-3">
            {steps.map((step) => (
              <li key={step.n} className="rounded-3xl bg-blue px-[22px] pt-6 pb-[22px] text-white">
                <span className="mb-[18px] block font-display text-[2.4rem] leading-none">
                  {step.n}
                </span>
                <h3 className="mb-2 text-[1.15rem] font-bold">{step.title}</h3>
                <p className="text-[15px] text-white/80">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Closing panel */}
      <section className="pt-2.5 pb-[72px]">
        <div className={WRAP}>
          <div className="grid items-end gap-6 rounded-[32px] bg-blue px-[22px] py-8 text-white min-[980px]:grid-cols-[1.4fr_0.8fr] min-[980px]:px-12 min-[980px]:py-14">
            <div>
              <p className="mb-3.5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.02em] text-white before:h-[7px] before:w-[7px] before:rounded-full before:bg-blue before:shadow-[0_0_0_4px_#ece7ff] before:content-['']">
                {t('close.label')}
              </p>
              <h2 className={`${H2} text-white`}>{t('close.heading')}</h2>
              <p className="max-w-[36rem] text-white/80">{t('close.body')}</p>
            </div>
            <div>
              <CalButton className={BTN_ON_BLUE}>{t('close.cta')}</CalButton>
              <p className="mt-3 text-[13.5px] text-white/80">
                {t('close.emailLead')}{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-white underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p className="mt-1.5 text-[13.5px] text-white/80">
                {t('close.phoneLead')}{' '}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white underline"
                >
                  {PHONE_DISPLAY}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — the site's own copyright line (home, /about). */}
      <div className="px-6 pt-8 pb-12 text-center text-xs tracking-[0.3px] text-night/35">
        {t('copyright', { year: new Date().getFullYear() })}
      </div>

      {/* Mobile sticky CTA. Sits above the site's bottom tab bar (< md),
          which is fixed at the foot of every page. */}
      <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] z-30 md:bottom-3 min-[980px]:hidden">
        <CalButton className={`${BTN_PRIMARY} w-full`}>
          {t('headerCta')}
        </CalButton>
      </div>
      <div aria-hidden="true" className="h-[76px] min-[980px]:hidden" />
    </div>
  );
}
