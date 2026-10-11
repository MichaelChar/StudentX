import { setRequestLocale, getTranslations } from 'next-intl/server';
import { HeaderSlot } from '@/components/HeaderSlot';
import { CalLoader, CalButton } from '@/components/boarding/CalBooking';
import FeeComparison from '@/components/boarding/FeeComparison';
import PathPlanner from '@/components/boarding/PathPlanner';
import Portrait from '@/components/boarding/Portrait';
import RouteLine from '@/components/boarding/RouteLine';
import ScoreCountUp from '@/components/boarding/ScoreCountUp';
import StepCards from '@/components/boarding/StepCards';
import {
  CONTACT_EMAIL,
  ENTRY_POINTS,
  FEE_TIERS_CHF,
  PHONE_DISPLAY,
  WHATSAPP_URL,
} from '@/components/boarding/config';
import {
  BTN_PRIMARY,
  DISPLAY,
  H2,
  LABEL,
  LINK,
  MUTED,
  PANEL,
  SPLIT,
  WRAP,
} from '@/components/boarding/styles';
import { currentSchoolYear } from '@/lib/boardingPath';

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
  call, 2026-10-02): headings in the site's display style, flat 8px
  buttons matching ui/Button's primary look, the site's own header, footer
  line and mobile tab bar.

  PathPlanner (age drives the timeline and the fee bars), FeeComparison (a
  static table) and StepCards (the three steps reveal on scroll) sit below.
  Their strings were approved by Michael on 2026-10-11, after the copy lock.
  The first credibility chip counts its score up, and the guide section
  draws the route. Both ship their finished state in the server HTML.
*/

export default async function BoardingPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'boarding' });
  const tp = await getTranslations({ locale, namespace: 'boarding.planner' });
  const tc = await getTranslations({ locale, namespace: 'boarding.compare' });

  const buildSchoolYear = currentSchoolYear(new Date());

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

  // "MYP 4" must never break between "MYP" and "4" in a narrow timeline step.
  const keepTogether = (programme) => programme.replace(/ /g, '\u00a0');

  const plannerStrings = {
    ageLabel: tp('ageLabel'),
    join: Object.fromEntries(ENTRY_POINTS.map((e) => [e.age, tp('join', { programme: keepTogether(e.programme) })])),
    years: Object.fromEntries(ENTRY_POINTS.map((e) => [e.age, tp('years', { n: e.years })])),
    moveUp: Object.fromEntries(
      ENTRY_POINTS.map((e) => [e.programme, tp('moveUp', { programme: keepTogether(e.programme) })]),
    ),
    nodes: {
      apply: tp('nodes.apply'),
      exams: tp('nodes.exams'),
      uni: tp('nodes.uni'),
    },
    notes: {
      uni: tp('nodes.uniNote'),
    },
    months: {
      sept: tp('months.sept'),
      may: tp('months.may'),
      autumn: tp('months.autumn'),
    },
    tiers: {
      value: tp('tiers.value'),
      mid: tp('tiers.mid'),
      top: tp('tiers.top'),
    },
    saving: tp.raw('saving'),
    cta: t('hero.cta'),
    ctaNote: tp('ctaNote'),
  };

  const compareStrings = {
    heading: tc('heading'),
    cols: {
      value: tc('cols.value'),
      mid: tc('cols.mid'),
      top: tc('cols.top'),
    },
    rows: {
      ib: tc('rows.ib'),
      counsellor: tc('rows.counsellor'),
      weekends: tc('rows.weekends'),
      campus: tc('rows.campus'),
      clubs: tc('rows.clubs'),
      fee: tc('rows.fee'),
    },
    cells: {
      campusValue: tc('cells.campusValue'),
      campusMid: tc('cells.campusMid'),
      campusTop: tc('cells.campusTop'),
      clubsValue: tc('cells.clubsValue'),
      clubsMid: tc('cells.clubsMid'),
      clubsTop: tc('cells.clubsTop'),
    },
    yes: tc('yes'),
    source: tc('source'),
  };

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
              <strong className="block text-[15px] font-bold tracking-[-0.02em]">
                {chip.n === 1 ? <ScoreCountUp text={chip.title} /> : chip.title}
              </strong>
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
        <div className={`${WRAP} mt-10`}>
          <FeeComparison strings={compareStrings} fees={FEE_TIERS_CHF} />
        </div>
      </section>

      {/* Path planner — one age control drives the timeline and the fees. */}
      <section className="pb-[72px]">
        <div className={WRAP}>
          <p className={LABEL}>{t('planner.label')}</p>
          <h2 className={H2}>{t('planner.heading')}</h2>
          <PathPlanner buildSchoolYear={buildSchoolYear} strings={plannerStrings} />
        </div>
      </section>

      {/* Meet your guide */}
      <section className="bg-parchment py-[72px]">
        <div className={`${WRAP} ${SPLIT} min-[980px]:grid-cols-[1.1fr_0.9fr]`}>
          <div>
            <p className={LABEL}>{t('guide.label')}</p>
            <h2 className={H2}>{t('guide.heading')}</h2>
            <p className={`max-w-[38rem] text-[1.08rem] ${MUTED}`}>{t('guide.body')}</p>
            <RouteLine from={t('guide.routeFrom')} to={t('guide.routeTo')} />
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
          <StepCards steps={steps} />
        </div>
      </section>

      {/* Closing panel */}
      <section className="pt-2.5 pb-[72px]">
        <div className={WRAP}>
          {/* Lilac panel with the page's standard CTA (founder's call,
              2026-10-11). The label is a gold pill rather than gold text:
              yellow text on parchment measures 1.39:1, night on yellow 10.3:1. */}
          <div className="grid items-end gap-6 rounded-[32px] bg-parchment px-[22px] py-8 min-[980px]:grid-cols-[1.4fr_0.8fr] min-[980px]:px-12 min-[980px]:py-14">
            <div>
              <p className="mb-3.5 inline-flex items-center gap-2 rounded-pill bg-yellow px-3 py-1 text-xs font-bold tracking-[0.02em] text-night before:h-[7px] before:w-[7px] before:rounded-full before:bg-blue before:content-['']">
                {t('close.label')}
              </p>
              <h2 className={H2}>{t('close.heading')}</h2>
              <p className={`max-w-[36rem] ${MUTED}`}>{t('close.body')}</p>
            </div>
            <div>
              <CalButton className={BTN_PRIMARY}>{t('close.cta')}</CalButton>
              <p className={`mt-3 text-[13.5px] ${MUTED}`}>
                {t('close.emailLead')}{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p className={`mt-1.5 text-[13.5px] ${MUTED}`}>
                {t('close.phoneLead')}{' '}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  {PHONE_DISPLAY}
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — the site's own copyright line (home, /about). */}
      <div className="px-6 pt-8 pb-12 text-center text-xs tracking-[0.3px] text-night/70">
        {t('copyright', { year: new Date().getFullYear() })}
      </div>

      {/* Mobile sticky CTA. Sits above the site's bottom tab bar (< md),
          which is fixed at the foot of every page. */}
      <div className="fixed inset-x-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+12px)] z-30 md:bottom-3 min-[980px]:hidden">
        {/* Night ring: this bar floats over every surface on the page —
            white, lilac panels, yellow highlights — and night reads on all
            of them. */}
        <CalButton className={`${BTN_PRIMARY} w-full outline-night focus-visible:outline-night`}>
          {t('headerCta')}
        </CalButton>
      </div>
      <div aria-hidden="true" className="h-[76px] min-[980px]:hidden" />
    </div>
  );
}
