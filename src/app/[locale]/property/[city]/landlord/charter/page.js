'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OrnamentRule from '@/components/ui/OrnamentRule';
import Icon from '@/components/ui/Icon';
import Pill from '@/components/ui/Pill';

export default function CharterPage() {
  const t = useTranslations('propylaea.charter');

  const prefs = [
    { title: t('pref1Title'), body: t('pref1Body') },
    { title: t('pref2Title'), body: t('pref2Body') },
    { title: t('pref3Title'), body: t('pref3Body') },
    { title: t('pref4Title'), body: t('pref4Body') },
    { title: t('pref5Title'), body: t('pref5Body') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative bg-night text-stone overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-yellow/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-blue/30 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="absolute right-4 top-1/2 -translate-y-1/2 font-display italic text-[10rem] md:text-[16rem] lg:text-[20rem] leading-none text-stone/5 select-none pointer-events-none"
        >
          X
        </span>

        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <p className="label-caps text-yellow mb-8">{t('heroEyebrow')}</p>
          <h1 className="font-display text-4xl md:text-6xl lg:text-[4.5rem] leading-[1.05] max-w-3xl">
            {t('heroBefore')}{' '}
            <span className="italic text-yellow">{t('heroItalic')}</span>
          </h1>
          <p className="mt-6 max-w-xl text-stone/70 text-lg md:text-xl leading-relaxed">
            {t('heroSubtitle')}
          </p>
          <div className="mt-8">
            <Pill variant="verified">{t('heroBadge')}</Pill>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 pt-10">
        <OrnamentRule />
      </div>

      {/* Section 01 — Context */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="label-caps text-yellow mb-5">{t('contextLabel')}</p>
        <h2 className="font-display text-3xl md:text-5xl text-night leading-tight max-w-3xl">
          {t('contextHeading')}{' '}
          <span className="italic text-yellow">{t('contextHeadingItalic')}</span>
        </h2>
        <p className="mt-6 max-w-2xl text-night/70 text-base md:text-lg leading-relaxed">
          {t('contextBody')}
        </p>

        {/* Demand snapshot */}
        <div className="mt-12">
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="font-display text-2xl text-night">
              {t('leaseHeading')}
            </h3>
            <p className="label-caps text-night/40">{t('contextSource')}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <StatTile
              tag={t('stat1Tag')}
              value={t('stat1Value')}
              label={t('stat1Label')}
            />
            <StatTile
              tag={t('stat2Tag')}
              value={t('stat2Value')}
              label={t('stat2Label')}
            />
            <StatTile
              tag={t('stat3Tag')}
              value={t('stat3Value')}
              label={t('stat3Label')}
            />
          </div>
        </div>

        {/* Callout */}
        <Card tone="night" border={false} className="mt-8 px-6 py-6 md:px-8 md:py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <p className="text-stone/80 text-base md:text-lg leading-relaxed max-w-lg">
            {t('calloutText')}
          </p>
          <div className="text-right shrink-0">
            <p className="font-display text-5xl md:text-6xl text-stone leading-none">
              {t('calloutValue')}
            </p>
            <p className="label-caps text-stone/50 mt-2">{t('calloutTag')}</p>
          </div>
        </Card>

        {/* Lease duration */}
        <div className="mt-10">
          <div className="flex items-baseline gap-4 mb-4">
            <h3 className="font-display text-xl text-night">{t('leaseHeading')}</h3>
            <p className="label-caps text-night/40">{t('leaseSource')}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <LeaseRow label={t('leaseRangeLabel')} value={t('leaseRangeValue')} />
            <LeaseRow label={t('leaseMedianLabel')} value={t('leaseMedianValue')} />
            <LeaseRow label={t('leaseAvgLabel')} value={t('leaseAvgValue')} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5">
        <OrnamentRule />
      </div>

      {/* Section 02 — Preferences, Offer & Claim */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="label-caps text-yellow mb-5">{t('prefsLabel')}</p>

        {/* Preference items */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 mt-8">
          {prefs.map((pref) => (
            <div key={pref.title} className="flex gap-4 items-start">
              <Icon
                name="shieldCheck"
                className="w-6 h-6 text-yellow shrink-0 mt-0.5"
              />
              <div>
                <p className="font-display text-lg text-night leading-snug">
                  {pref.title}
                </p>
                <p className="text-night/60 text-sm mt-1">{pref.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Founding offer */}
        <Card
          tone="night"
          border={false}
          className="mt-14 px-6 py-8 md:px-10 md:py-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center"
        >
          <div>
            <h3 className="font-display text-2xl md:text-3xl text-stone leading-tight">
              {t('offerHeadline')}
            </h3>
            <p className="mt-4 text-stone/70 text-base leading-relaxed">
              {t('offerBody')}
            </p>
          </div>
          <div className="md:text-right">
            <p className="label-caps text-stone/50 mb-1">{t('offerTierLabel')}</p>
            <p className="font-display text-xl text-stone mb-3">
              {t('offerTierName')}
            </p>
            <p className="flex items-baseline gap-3 md:justify-end">
              <span className="text-stone/40 line-through text-lg">
                {t('priceOriginal')}
              </span>
              <span className="font-display text-4xl md:text-5xl text-yellow leading-none">
                {t('priceDiscounted')}
              </span>
              <span className="text-stone/60 text-lg">{t('pricePeriod')}</span>
            </p>
            <div className="mt-3">
              <Pill variant="verified">{t('priceBadge')}</Pill>
            </div>
          </div>
        </Card>

        {/* How to claim */}
        <div className="mt-16">
          <h3 className="font-display text-2xl md:text-3xl text-night">
            {t('claimHeading')}
          </h3>
          <p className="text-night/60 mt-2">{t('claimSubheading')}</p>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-10">
            <div>
              <span className="font-display text-5xl text-yellow block leading-none mb-4">
                01
              </span>
              <h4 className="font-display text-xl text-night mb-2">
                {t('step1Title')}
              </h4>
              <p className="text-night/70 text-base leading-relaxed max-w-sm">
                {t('step1Body')}
              </p>
            </div>
            <div>
              <span className="font-display text-5xl text-yellow block leading-none mb-4">
                02
              </span>
              <h4 className="font-display text-xl text-night mb-2">
                {t('step2Title')}
              </h4>
              <p className="text-night/70 text-base leading-relaxed max-w-sm">
                {t('step2Body')}
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-4">
            <Button href="/property/thessaloniki/landlord/signup" variant="gold" size="lg">
              {t('ctaClaim')}
            </Button>
            <a
              href="/founding-landlord-brief.pdf"
              download
              className="inline-flex items-center justify-center gap-2 font-sans font-semibold tracking-[0.08em] uppercase text-sm px-7 py-4 rounded border border-night/30 text-night bg-transparent hover:bg-night hover:text-stone transition-colors"
            >
              {t('downloadBrief')}
            </a>
          </div>
        </div>

        <div className="mt-16 text-center">
          <p className="label-caps text-night/40">{t('confidentialFooter')}</p>
        </div>
      </section>
    </>
  );
}

function StatTile({ tag, value, label }) {
  return (
    <Card tone="parchment" border={false} className="px-6 py-6">
      <p className="label-caps text-blue/60 mb-3">{tag}</p>
      <p className="font-display text-5xl md:text-6xl text-blue leading-none">
        {value}
      </p>
      <p className="mt-3 text-night/60 text-sm leading-relaxed">{label}</p>
    </Card>
  );
}

function LeaseRow({ label, value }) {
  return (
    <div className="border-t border-night/10 pt-3">
      <p className="label-caps text-night/40 mb-1">{label}</p>
      <p className="font-display text-xl text-night">{value}</p>
    </div>
  );
}
