'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

/*
  Propylaea matching quiz — three steps:
    01 · Budget
    02 · Type
    03 · Dealbreakers (negative filters)

  Submits to /results?budget=…&types=…&dealbreakers=…
  The /results page already understands `dealbreakers=ground_floor,bills_not_included`
  for client-side filtering (see results/page.js fetchListings).
*/

const BUDGET_MIN = 250;
const BUDGET_MAX = 1200;
const BUDGET_STEP = 25;
const BUDGET_DEFAULT = 550;

const TYPE_OPTIONS = [
  { value: 'Studio', labelKey: 'typeStudio' },
  { value: '1-Bedroom', labelKey: 'type1Bed' },
  { value: '2-Bedroom', labelKey: 'type2Bed' },
  { value: 'Room in shared apartment', labelKey: 'typeShared' },
];

// Dealbreaker keys must align with what /results/page.js filters on.
const DEALBREAKERS = [
  { value: 'unfurnished', labelKey: 'dbUnfurnished' },
  { value: 'ground_floor', labelKey: 'dbGroundFloor' },
  { value: 'no_ac', labelKey: 'dbNoAc' },
  { value: 'bills_not_included', labelKey: 'dbBillsNotIncluded' },
];

export default function QuizPage() {
  const t = useTranslations('propylaea.quiz');
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [budget, setBudget] = useState(BUDGET_DEFAULT);
  const [types, setTypes] = useState([]);
  const [dealbreakers, setDealbreakers] = useState([]);

  function toggleIn(list, setList, value) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function handleSubmit() {
    const params = new URLSearchParams();
    params.set('budget', String(budget));
    if (types.length > 0) params.set('types', types.join(','));
    if (dealbreakers.length > 0) {
      params.set('dealbreakers', dealbreakers.join(','));
    }
    router.push(`/results?${params.toString()}`);
  }

  const stepIndicators = [
    { num: '01', label: t('stepBudget'), active: step === 1 },
    { num: '02', label: t('stepTypeArea'), active: step === 2 },
    { num: '03', label: t('stepDealbreakers'), active: step === 3 },
  ];

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
      {/* Heading */}
      <h1 className="font-display text-4xl md:text-5xl text-night text-center leading-tight">
        {t('heading')}{' '}
        <span className="italic text-gold">{t('headingItalic')}</span>
      </h1>

      {/* Step indicator */}
      <ol className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        {stepIndicators.map((s, idx) => (
          <li key={s.num} className="flex items-center gap-6">
            <span
              className={`label-caps ${s.active ? 'text-blue' : 'text-night/30'}`}
            >
              {s.num} · {s.label}
            </span>
            {idx < stepIndicators.length - 1 && (
              <span aria-hidden="true" className="text-night/20">
                |
              </span>
            )}
          </li>
        ))}
      </ol>

      <Card tone="white" className="mt-10 px-6 py-10 md:px-12 md:py-14 rounded-sm border border-night/10">
        {step === 1 && (
          <BudgetStep t={t} budget={budget} setBudget={setBudget} />
        )}

        {step === 2 && (
          <TypeStep
            t={t}
            types={types}
            onToggleType={(v) => toggleIn(types, setTypes, v)}
          />
        )}

        {step === 3 && (
          <DealbreakersStep
            t={t}
            dealbreakers={dealbreakers}
            onToggle={(v) => toggleIn(dealbreakers, setDealbreakers, v)}
          />
        )}

        {/* Nav controls */}
        <div className="mt-10 flex items-center justify-between">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              ← {t('back')}
            </Button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              {t('continue')} →
            </Button>
          ) : (
            <Button variant="gold" onClick={handleSubmit}>
              {t('seeMatches')} →
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function BudgetStep({ t, budget, setBudget }) {
  return (
    <div>
      <p className="font-display italic text-night/60 text-base">
        {t('budgetGreek')}
      </p>
      <p className="label-caps text-night/80 mt-1">{t('budgetEnglish')}</p>
      <h2 className="mt-5 font-display text-2xl md:text-3xl text-night leading-tight">
        {t('budgetQuestion')}
      </h2>

      <div className="mt-10 text-center">
        <p className="font-display text-5xl md:text-6xl text-blue leading-none">
          €{budget}
        </p>
        <p className="mt-3 label-caps text-night/50">{t('budgetPerMonth')}</p>
      </div>

      <div className="mt-10">
        <input
          type="range"
          min={BUDGET_MIN}
          max={BUDGET_MAX}
          step={BUDGET_STEP}
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          className="w-full"
          aria-label={t('budgetQuestion')}
        />
        <div className="flex justify-between mt-2 text-xs text-night/40">
          <span>€{BUDGET_MIN}</span>
          <span>€{BUDGET_MAX}</span>
        </div>
      </div>
    </div>
  );
}

function TypeStep({ t, types, onToggleType }) {
  return (
    <div>
      <p className="font-display italic text-night/60 text-base">
        {t('typeAreaGreek')}
      </p>
      <p className="label-caps text-night/80 mt-1">{t('typeAreaEnglish')}</p>
      <h2 className="mt-5 font-display text-2xl md:text-3xl text-night leading-tight">
        {t('typeQuestion')}
      </h2>

      <div className="mt-6 flex flex-wrap gap-2">
        {TYPE_OPTIONS.map((opt) => {
          const active = types.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggleType(opt.value)}
              aria-pressed={active}
              className={`px-4 py-2 rounded-sm border text-sm font-sans transition-colors ${
                active
                  ? 'border-blue bg-blue text-white'
                  : 'border-night/20 text-night hover:border-blue'
              }`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DealbreakersStep({ t, dealbreakers, onToggle }) {
  return (
    <div>
      <p className="font-display italic text-night/60 text-base">
        {t('dealbreakersGreek')}
      </p>
      <p className="label-caps text-night/80 mt-1">
        {t('dealbreakersEnglish')}
      </p>
      <h2 className="mt-5 font-display text-2xl md:text-3xl text-night leading-tight">
        {t('dealbreakersQuestion')}
      </h2>
      <p className="mt-3 text-night/60 text-sm">{t('dealbreakersHint')}</p>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {DEALBREAKERS.map((opt) => {
          const active = dealbreakers.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              aria-pressed={active}
              className={`flex items-center gap-3 px-4 py-3 rounded-sm border text-left transition-colors ${
                active
                  ? 'border-blue bg-blue/5 text-night'
                  : 'border-night/20 text-night/80 hover:border-blue'
              }`}
            >
              <span
                aria-hidden="true"
                className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 ${
                  active ? 'border-blue bg-blue' : 'border-night/30 bg-white'
                }`}
              >
                {active && (
                  <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white">
                    <path
                      d="M2 6.5 4.8 9 10 3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="font-sans text-sm">{t(opt.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
