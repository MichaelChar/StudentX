'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OrnamentRule from '@/components/ui/OrnamentRule';
import StripeGradientMesh from '@/components/property/StripeGradientMesh';

export default function CharterPage() {
  const t = useTranslations('propylaea.charter');

  return (
    <>
      {/* Hero — Stripe-style WebGL mesh gradient background */}
      <section className="relative overflow-hidden">
        <StripeGradientMesh />
        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <p className="label-caps text-yellow mb-8">{t('heroEyebrow')}</p>
          <h1 className="font-display text-4xl md:text-6xl lg:text-[4.5rem] leading-[1.05] max-w-3xl text-night">
            {t('heroBefore')}{' '}
            <span className="italic text-yellow">{t('heroItalic')}</span>{' '}
            {t('heroAfter')}
          </h1>
          <p className="mt-6 max-w-xl text-night/70 text-lg md:text-xl leading-relaxed">
            {t('heroSubtitle')}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button href="/property/thessaloniki/landlord/signup" animated size="lg">
              {t('ctaPrimary')}
            </Button>
            <Button href="/property/thessaloniki/landlord/login" variant="outline" size="lg">
              {t('ctaSecondary')}
            </Button>
          </div>
        </div>
      </section>

      {/* Stat tiles — standalone, no programme heading */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatTile value={t('statListingsValue')} label={t('statListings')} />
          <StatTile value={t('statReplyValue')} label={t('statReply')} />
          <StatTile value={t('statBrokerageValue')} label={t('statBrokerage')} />
        </div>
      </section>

      {/* Demand snapshot — three-fact rail + dark callout + lease appendix */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <header className="max-w-3xl">
          <p className="label-caps text-yellow mb-5">{t('demandEyebrow')}</p>
        </header>

        {/* Data rail */}
        <div className="mt-12 border-t border-b border-night/10">
          <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-night/10">
            <DemandFact
              tag={t('demand1Tag')}
              value={t('demand1Value')}
              unit={t('demand1Unit')}
              body={t('demand1Body')}
            />
            <DemandFact
              tag={t('demand2Tag')}
              value={t('demand2Value')}
              unit={t('demand2Unit')}
              body={t('demand2Body')}
            />
            <DemandFact
              tag={t('demand3Tag')}
              value={t('demand3Value')}
              unit={t('demand3Unit')}
              body={t('demand3Body')}
            />
          </div>
        </div>

        {/* Dark callout + appendix grid */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Single-window arrival callout */}
          <div className="md:col-span-8 bg-night rounded-sm px-7 py-7 md:px-9 md:py-9 relative overflow-hidden">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-magenta inline-block" />
                  <span className="label-caps text-stone/60">{t('calloutEyebrow')}</span>
                </div>
                <p className="mt-5 font-display text-stone text-xl md:text-[22px] leading-snug max-w-[34ch]">
                  {t('calloutHeadlineBefore')}
                  <em className="text-yellow not-italic">
                    <span className="italic">{t('calloutHeadlineItalic')}</span>
                  </em>
                  {t('calloutHeadlineAfter')}
                </p>
                <p className="mt-4 text-stone/60 text-sm leading-relaxed max-w-[44ch]">
                  {t('calloutSub')}
                </p>
              </div>

              {/* Giant numeral on the right */}
              <div className="hidden md:flex flex-col items-end shrink-0 pl-4 border-l border-stone/15">
                <span className="font-display text-stone text-[120px] leading-[0.85] tabular-nums -mr-1">
                  {t('calloutGiant')}
                </span>
                <span className="label-caps text-stone/50 mt-3">{t('calloutBottomTag')}</span>
              </div>
            </div>
          </div>

          {/* Lease appendix */}
          <aside className="md:col-span-4 bg-parchment rounded-sm px-6 py-6 md:px-7 md:py-7 flex flex-col">
            <p className="label-caps text-night/40">{t('appendixLabel')}</p>
            <div className="mt-5 divide-y divide-night/10 text-[15px]">
              <LeaseRow label={t('appendixRange')} value={t('appendixRangeValue')} />
              <LeaseRow label={t('appendixMedian')} value={t('appendixMedianValue')} />
              <LeaseRow label={t('appendixAverage')} value={t('appendixAverageValue')} />
            </div>
          </aside>
        </div>

        {/* Source meta */}
        <div className="mt-7 flex items-center justify-end text-night/40">
          <span className="label-caps">{t('sourceLabel')}</span>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5">
        <OrnamentRule />
      </div>

      {/* How it works — two steps introducing the landlord offer */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <header className="max-w-3xl">
          <p className="label-caps text-yellow mb-5">{t('howEyebrow')}</p>
          <h2 className="font-display text-night text-3xl md:text-5xl leading-[1.05]">
            {t('howTitle')}
          </h2>
        </header>

        <ol className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Step 1 — parchment */}
          <li className="bg-parchment rounded-sm px-7 py-8 md:py-9 flex flex-col min-h-[280px]">
            <div className="flex items-baseline justify-between">
              <span className="label-caps text-night/40">{t('step1Tag')}</span>
              <span aria-hidden="true" className="font-display text-night/15 text-5xl tabular-nums leading-none">
                01
              </span>
            </div>
            <h3 className="font-display text-night text-xl md:text-2xl mt-6 leading-snug">
              {t('step1Title')}
            </h3>
            <p className="mt-3 text-night/70 text-sm leading-relaxed">
              {t('step1Body')}
            </p>
            <div className="mt-auto pt-6">
              <span className="label-caps text-night/40">{t('step1Time')}</span>
            </div>
          </li>

          {/* Step 2 — dark */}
          <li className="bg-night rounded-sm px-7 py-8 md:py-9 flex flex-col min-h-[280px] relative">
            <div className="flex items-baseline justify-between">
              <span className="label-caps text-stone/50">{t('step2Tag')}</span>
              <span aria-hidden="true" className="font-display text-stone/20 text-5xl tabular-nums leading-none">
                02
              </span>
            </div>
            <h3 className="font-display text-stone text-xl md:text-2xl mt-6 leading-snug">
              {t('step2Title')}
            </h3>
            <p className="mt-3 text-stone/60 text-sm leading-relaxed">
              {t('step2Body')}
            </p>
            <div className="mt-auto pt-6 flex items-center gap-2">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-yellow inline-block" />
              <span className="label-caps text-stone/60">{t('step2BrokerageTag')}</span>
            </div>
          </li>
        </ol>

        <div className="mt-16 flex justify-center">
          <Button href="/property/thessaloniki/landlord/signup" animated size="lg">
            {t('ctaPrimary')}
          </Button>
        </div>
      </section>
    </>
  );
}

function StatTile({ value, label }) {
  return (
    <Card tone="parchment" border={false} className="px-6 py-8">
      <p className="font-display text-5xl md:text-6xl text-yellow leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-4 label-caps text-night/60">{label}</p>
    </Card>
  );
}

function DemandFact({ tag, value, unit, body }) {
  return (
    <div className="px-6 py-7 md:py-8 relative">
      <p className="label-caps text-night/40">{tag}</p>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="font-display text-night text-6xl md:text-[68px] tabular-nums leading-none">
          {value}
        </span>
        <span className="font-display text-night/40 text-3xl md:text-4xl leading-none">
          {unit}
        </span>
      </div>
      <p className="mt-4 text-night/70 text-sm leading-relaxed max-w-[26ch]">
        {body}
      </p>
    </div>
  );
}

function LeaseRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between py-2.5">
      <span className="text-night/60">{label}</span>
      <span className="font-display text-night tabular-nums">{value}</span>
    </div>
  );
}
