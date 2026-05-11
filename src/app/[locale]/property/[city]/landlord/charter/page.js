'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OrnamentRule from '@/components/ui/OrnamentRule';
import StripeGradientMesh from '@/components/property/StripeGradientMesh';

export default function CharterPage() {
  const t = useTranslations('propylaea.charter');

  const steps = [
    { numeral: 'Ⅰ', title: t('step1Title'), body: t('step1Body') },
    { numeral: 'Ⅱ', title: t('step2Title'), body: t('step2Body') },
    { numeral: 'Ⅲ', title: t('step3Title'), body: t('step3Body') },
  ];

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

      <div className="mx-auto max-w-6xl px-5">
        <OrnamentRule />
      </div>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <p className="label-caps text-yellow mb-5">{t('howEyebrow')}</p>
        <h2 className="font-display text-3xl md:text-5xl text-night leading-tight max-w-3xl">
          {t('howTitle')}{' '}
          <span className="italic text-yellow">{t('howTitleItalic')}</span>
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-10">
          {steps.map((step) => (
            <div key={step.numeral} className="relative">
              <span
                className="font-display text-5xl text-yellow block leading-none mb-5"
                aria-hidden="true"
              >
                {step.numeral}
              </span>
              <h3 className="font-display text-2xl text-night leading-tight mb-3">
                {step.title}
              </h3>
              <p className="text-night/70 text-base leading-relaxed max-w-xs">
                {step.body}
              </p>
            </div>
          ))}
        </div>

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
      <p className="font-display text-5xl md:text-6xl text-yellow leading-none">
        {value}
      </p>
      <p className="mt-4 label-caps text-night/60">{label}</p>
    </Card>
  );
}
