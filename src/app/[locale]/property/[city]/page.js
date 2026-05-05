'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OrnamentRule from '@/components/ui/OrnamentRule';

/*
  Propylaea landing — the marketing home at /[locale]/.
  Hero with bilingual eyebrow and gold italic accent, stat tiles row
  (live listing count + reply time + brokerage), and a 3-step
  "How it works" section. The "Vetting, not luck" copy block has been
  removed per stakeholder direction; the stat tiles stand on their own.
*/
export default function LandingPage() {
  const t = useTranslations('propylaea.landing');
  const [listingCount, setListingCount] = useState(null);

  // Live count of active listings, used in the stat tile. Calls a
  // dedicated count endpoint instead of fetching the full listings
  // payload — the previous version downloaded ~80 KB of joined rows
  // just to read `.length`.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/listings/count')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const n = typeof data.count === 'number' ? data.count : 0;
        setListingCount(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = [
    {
      numeral: 'Ⅰ',
      greek: t('step1Greek'),
      english: t('step1English'),
      body: t('step1Body'),
    },
    {
      numeral: 'Ⅱ',
      greek: t('step2Greek'),
      english: t('step2English'),
      body: t('step2Body'),
    },
    {
      numeral: 'Ⅲ',
      greek: t('step3Greek'),
      english: t('step3English'),
      body: t('step3Body'),
    },
  ];

  return (
    <>
      {/* Hero — Night surface */}
      <section className="relative bg-night text-stone overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-gold/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-32 -left-20 w-[28rem] h-[28rem] rounded-full bg-blue/30 blur-3xl"
        />

        <div className="relative mx-auto max-w-6xl px-5 pt-20 pb-24 md:pt-28 md:pb-32">
          <p className="label-caps text-gold mb-8">{t('eyebrow')}</p>
          <h1 className="font-display text-4xl md:text-6xl lg:text-[4.5rem] leading-[1.05] max-w-3xl">
            {t('heroBefore')}{' '}
            <span className="italic text-gold">{t('heroItalic')}</span>{' '}
            {t('heroAfter')}
          </h1>
          <p className="mt-6 max-w-xl text-stone/70 text-lg md:text-xl leading-relaxed">
            {t('subtitle')}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Button href="/property/quiz" variant="gold" size="lg">
              {t('ctaPrimary')}
            </Button>
            <Button href="/property/results" variant="outlineOnDark" size="lg">
              {t('ctaSecondary')}
            </Button>
          </div>
        </div>
      </section>

      {/* Stat tiles — standalone, no programme heading */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-24">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <StatTile
            value={listingCount == null ? '—' : String(listingCount)}
            label={t('statListings')}
          />
          <StatTile value={t('statReplyValue')} label={t('statReply')} />
          <StatTile value={t('statBrokerageValue')} label={t('statBrokerage')} />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5">
        <OrnamentRule />
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="label-caps text-gold mb-5">{t('howEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-5xl text-night leading-tight max-w-3xl">
          {t('howTitle')}{' '}
          <span className="italic text-gold">{t('howTitleItalic')}</span>
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((step) => (
            <div key={step.numeral} className="relative">
              <span
                className="font-display text-5xl text-gold block leading-none mb-5"
                aria-hidden="true"
              >
                {step.numeral}
              </span>
              <p className="label-caps text-night/50 mb-2">{step.greek}</p>
              <h3 className="font-display text-2xl text-night leading-tight mb-3">
                {step.english}
              </h3>
              <p className="text-night/70 text-base leading-relaxed max-w-xs">
                {step.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 flex justify-center">
          <Button href="/property/quiz" variant="primary" size="lg">
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
      <p className="font-display text-5xl md:text-6xl text-blue leading-none">
        {value}
      </p>
      <p className="mt-4 label-caps text-night/60">{label}</p>
    </Card>
  );
}
