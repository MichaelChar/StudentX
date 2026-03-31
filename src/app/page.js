'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';

const DURATIONS = [
  { value: 'spring-semester', label: 'Spring Semester' },
  { value: 'autumn-semester', label: 'Autumn Semester' },
  { value: 'academic-year', label: 'Academic Year' },
  { value: 'custom', label: 'Custom' },
];

const PROPERTY_TYPES = [
  { value: 'studio-1bed', label: 'Studio / 1-Bedroom', dbTypes: ['Studio', '1-Bedroom'] },
  { value: '2-bed', label: '2 Bedrooms', dbTypes: ['2-Bedroom'] },
  { value: '2-plus-bed', label: '2+ Bedrooms', dbTypes: ['2-Bedroom'] },
  { value: 'room', label: 'Room in shared apartment', dbTypes: ['Room in shared apartment'] },
];

const DEALBREAKERS = [
  { value: 'ground_floor', label: 'Ground floor' },
  { value: 'no_ac', label: 'No AC' },
  { value: 'bills_not_included', label: 'Bills not included' },
  { value: 'unfurnished', label: 'Unfurnished' },
];

const DEFAULT_BUDGET_MAX = 1200;
const BUDGET_MIN = 300;
const BUDGET_STEP = 100;

function getSemesterDates(duration) {
  const now = new Date();
  const year = now.getFullYear();

  switch (duration) {
    case 'autumn-semester':
      return { from: `${year}-10-01`, to: `${year + 1}-01-31` };
    case 'spring-semester':
      return { from: `${year + 1}-02-01`, to: `${year + 1}-06-30` };
    case 'academic-year':
      return { from: `${year}-10-01`, to: `${year + 1}-06-30` };
    default:
      return { from: '', to: '' };
  }
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export default function QuizPage() {
  const router = useRouter();
  const [faculties, setFaculties] = useState([]);
  const [facultyError, setFacultyError] = useState(false);
  const [formData, setFormData] = useState({
    faculty: '',
    duration: '',
    dateFrom: '',
    dateTo: '',
    budget: BUDGET_MIN,
    types: [],
    dealbreakers: [],
  });

  useEffect(() => {
    fetch('/api/faculties')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch');
        return res.json();
      })
      .then((data) => setFaculties(data.faculties || []))
      .catch(() => setFacultyError(true));
  }, []);

  const semesterDates = useMemo(
    () => getSemesterDates(formData.duration),
    [formData.duration]
  );

  const isCustomDuration = formData.duration === 'custom';
  const isPresetDuration = formData.duration && !isCustomDuration;

  const displayFrom = isPresetDuration
    ? formatDateDisplay(semesterDates.from)
    : formatDateDisplay(formData.dateFrom);
  const displayTo = isPresetDuration
    ? formatDateDisplay(semesterDates.to)
    : formatDateDisplay(formData.dateTo);

  function toggleArrayValue(field, value) {
    setFormData((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  }

  function handleDurationChange(value) {
    setFormData((prev) => ({
      ...prev,
      duration: value,
      dateFrom: '',
      dateTo: '',
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (formData.faculty) params.set('faculty', formData.faculty);
    if (formData.duration) params.set('duration', formData.duration);

    const fromDate = isPresetDuration ? semesterDates.from : formData.dateFrom;
    const toDate = isPresetDuration ? semesterDates.to : formData.dateTo;
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    params.set('budget', formData.budget.toString());
    if (formData.types.length > 0) {
      const dbTypeNames = [...new Set(
        formData.types.flatMap((val) => {
          const pt = PROPERTY_TYPES.find((p) => p.value === val);
          return pt ? pt.dbTypes : [];
        })
      )];
      if (dbTypeNames.length > 0) params.set('types', dbTypeNames.join(','));
    }
    if (formData.dealbreakers.length > 0) params.set('dealbreakers', formData.dealbreakers.join(','));
    router.push(`/results?${params.toString()}`);
  }

  return (
    <>
      {/* Hero — dark premium section */}
      <section className="relative bg-midnight overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-ink/40 to-midnight" />
        <div className="relative mx-auto max-w-4xl px-4 py-24 md:py-36 text-center">
          <p className="uppercase tracking-[0.25em] text-gold text-sm font-heading font-semibold mb-6">
            Thessaloniki
          </p>
          <h1 className="font-heading text-4xl md:text-6xl font-bold text-white leading-tight mb-6 lowercase">
            your home near campus.
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-xl mx-auto">
            student housing. for you.
          </p>
        </div>
      </section>

      {/* Form section */}
      <section className="mx-auto max-w-2xl px-4 -mt-12 relative z-10 pb-16">
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 md:p-10 space-y-8"
        >
          {/* Faculty */}
          <fieldset>
            <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Faculty
            </label>
            <select
              value={formData.faculty}
              onChange={(e) => setFormData({ ...formData, faculty: e.target.value })}
              className="w-full rounded-lg border border-gray-200 bg-gray-light px-4 py-3.5 text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-colors"
            >
              <option value="">Select your faculty</option>
              {faculties.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {facultyError && (
              <p className="mt-2 text-sm text-red-600">
                Could not load faculties. Please refresh the page.
              </p>
            )}
          </fieldset>

          {/* Duration */}
          <fieldset>
            <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Duration
            </label>
            <select
              value={formData.duration}
              onChange={(e) => handleDurationChange(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-light px-4 py-3.5 text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition-colors"
            >
              <option value="">Select duration</option>
              {DURATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            {isPresetDuration && (
              <div className="mt-3 flex items-center gap-3 text-sm text-gray-dark/60 bg-gray-light rounded-lg px-4 py-3">
                <svg className="w-4 h-4 text-gold shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{displayFrom} &mdash; {displayTo}</span>
              </div>
            )}

            {isCustomDuration && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-dark/50 mb-1">From</label>
                  <input
                    type="date"
                    value={formData.dateFrom}
                    onChange={(e) => setFormData({ ...formData, dateFrom: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-light px-4 py-3 text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-dark/50 mb-1">To</label>
                  <input
                    type="date"
                    value={formData.dateTo}
                    onChange={(e) => setFormData({ ...formData, dateTo: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 bg-gray-light px-4 py-3 text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* Budget */}
          <fieldset>
            <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-2">
              Budget
            </label>
            <p className="text-sm text-gray-dark/60 mb-3">
              Up to <span className="font-semibold text-navy">&euro;{formData.budget}</span> / month
            </p>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={BUDGET_MIN}
                max={DEFAULT_BUDGET_MAX}
                step={BUDGET_STEP}
                value={formData.budget}
                onChange={(e) =>
                  setFormData({ ...formData, budget: Number(e.target.value) })
                }
                aria-label="Budget upper bound"
                aria-valuetext={`€${formData.budget} per month`}
                className="flex-1"
              />
              <input
                type="number"
                min={BUDGET_MIN}
                max={DEFAULT_BUDGET_MAX}
                step={BUDGET_STEP}
                value={formData.budget}
                onChange={(e) => {
                  const val = Math.min(DEFAULT_BUDGET_MAX, Math.max(BUDGET_MIN, Number(e.target.value)));
                  setFormData({ ...formData, budget: val });
                }}
                className="w-20 rounded-lg border border-gray-200 bg-gray-light px-3 py-2 text-center text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />
            </div>
            <div className="flex justify-between text-xs text-gray-dark/40 mt-1">
              <span>&euro;{BUDGET_MIN}</span>
              <span>&euro;{DEFAULT_BUDGET_MAX}</span>
            </div>
          </fieldset>

          {/* Property type */}
          <fieldset>
            <legend className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-3">
              Property type
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PROPERTY_TYPES.map((pt) => (
                <label
                  key={pt.value}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                    formData.types.includes(pt.value)
                      ? 'border-gold bg-gold/5 shadow-sm'
                      : 'border-gray-200 bg-gray-light hover:border-gold/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.types.includes(pt.value)}
                    onChange={() => toggleArrayValue('types', pt.value)}
                    className="accent-gold w-4 h-4"
                  />
                  <span className="text-gray-dark text-sm">{pt.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Dealbreakers */}
          <fieldset>
            <legend className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-3">
              Dealbreakers
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {DEALBREAKERS.map((db) => (
                <label
                  key={db.value}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-all ${
                    formData.dealbreakers.includes(db.value)
                      ? 'border-gold bg-gold/5 shadow-sm'
                      : 'border-gray-200 bg-gray-light hover:border-gold/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.dealbreakers.includes(db.value)}
                    onChange={() => toggleArrayValue('dealbreakers', db.value)}
                    className="accent-gold w-4 h-4"
                  />
                  <span className="text-gray-dark text-sm">{db.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Submit */}
          <button
            type="submit"
            className="w-full bg-navy text-white font-heading font-semibold px-8 py-4 rounded-lg hover:bg-navy/90 transition-colors cursor-pointer text-base tracking-wide"
          >
            Find housing
          </button>
        </form>
      </section>
    </>
  );
}
