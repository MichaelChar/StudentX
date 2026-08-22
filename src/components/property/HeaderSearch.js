'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import Popover from '@/components/ui/Popover';
import Icon from '@/components/ui/Icon';
import { COUNTRIES, CITY_ACCENTS } from '@/lib/cityRoutes';

/*
  HeaderSearch — the header's search control (parity Feature 1).

  TWO segments, not Airbnb's three. `Who` is dropped: room capacity is fixed
  per listing, so a guest stepper means nothing here, and `Where` takes the
  freed width.

    ╭────────────────────────┬──────────────────────╮
    │ Where                  │ When                 │  ( 🔍 )
    │ Search destinations    │ Add dates            │
    ╰────────────────────────┴──────────────────────╯

  Feature 2 — on results pages this collapses to a pill and expands on click.
  The caller passes `collapsed`, because only it knows which surface it is on.

  WHERE IS NOT AIRBNB'S. Theirs assumes every destination works. Six of our
  seven cities are `status: 'coming-soon'` (see lib/cityRoutes.js), so a
  student picking Athens cannot be sent to results that do not exist — those
  rows route to the city's coming-soon page instead, and say so. Pretending
  otherwise would be the worst kind of parity.

  ⚠️ NOT BUILT, needs content that does not exist yet:
    - the one-line description per city ("Family friendly", "A hidden gem")
    - the per-city illustration tile
  Feature 1 lists both as ❌. The colour tile IS real — `CITY_ACCENTS` already
  carries a `bg`/`ink` pair per city — so rows render as a tinted tile plus the
  city name, and gain the illustration and strapline when someone writes them.

  `Recent searches` is also deliberately absent: it needs per-user or
  localStorage search history, which is net-new persistence rather than UI.
*/

function CityTile({ accent }) {
  const a = CITY_ACCENTS[accent] || CITY_ACCENTS.thessaloniki;
  return (
    // Colour-only, matching the amenity-tile decision (§15): a plain tinted
    // square until real artwork lands, at which point the illustration sits in
    // `ink` on this same `bg` and nothing else about the row changes.
    <span
      aria-hidden="true"
      className="h-10 w-10 shrink-0 rounded-photo"
      style={{ backgroundColor: a.bg }}
    />
  );
}

function SegmentButton({ label, value, placeholder, onClick, expanded }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="flex-1 min-w-0 rounded-full px-6 py-3 text-left transition-colors
                 hover:bg-parchment active:bg-parchment/70"
    >
      <span className="block label-caps text-night/60">{label}</span>
      <span className={`block truncate text-sm ${value ? 'text-night' : 'text-night/40'}`}>
        {value || placeholder}
      </span>
    </button>
  );
}

export default function HeaderSearch({
  collapsed = false,
  city = 'thessaloniki',
  dates,
  onDatesChange,
  renderDatePanel,
  className = '',
}) {
  const t = useTranslations('propylaea.search');
  const router = useRouter();
  const [selectedCity, setSelectedCity] = useState(city);
  const [expanded, setExpanded] = useState(!collapsed);

  const cityName =
    COUNTRIES.flatMap((c) => c.cities).find((c) => c.slug === selectedCity)?.name || '';

  const dateLabel =
    dates?.moveIn && dates?.moveOut
      ? `${dates.moveIn} – ${dates.moveOut}`
      : dates?.moveIn || '';

  function submit() {
    const params = new URLSearchParams();
    if (dates?.moveIn) params.set('move_in', dates.moveIn);
    if (dates?.moveOut) params.set('move_out', dates.moveOut);
    const qs = params.toString();
    router.push(`/property/${selectedCity}/results${qs ? `?${qs}` : ''}`);
  }

  if (collapsed && !expanded) {
    // Feature 2 — the collapsed pill. Deliberately summarises the CURRENT
    // search rather than showing placeholders, so it reads as state.
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={`inline-flex items-center gap-3 rounded-full border border-night/15 bg-stone
                    py-2 pl-5 pr-2 shadow-sm transition-[box-shadow,border-color]
                    hover:shadow-md hover:border-night/30 ${className}`}
      >
        <span className="text-sm text-night">{cityName}</span>
        <span aria-hidden="true" className="h-4 w-px bg-night/15" />
        <span className="text-sm text-night/60">{dateLabel || t('addDates')}</span>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-blue text-white">
          <Icon name="search" className="h-4 w-4" />
        </span>
      </button>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-night/15 bg-stone
                  p-1.5 shadow-sm ${className}`}
    >
      <Popover
        placement="bottom-start"
        className="w-80 max-h-96 overflow-y-auto p-2"
        trigger={
          <SegmentButton
            label={t('whereLabel')}
            value={cityName}
            placeholder={t('wherePlaceholder')}
          />
        }
      >
        {COUNTRIES.map((country) => (
          <div key={country.code} role="none" className="mb-2 last:mb-0">
            <p className="px-3 py-1.5 label-caps text-night/45">
              {country.flag} {country.name}
            </p>
            {country.cities.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  setSelectedCity(c.slug);
                  // A coming-soon city has no results to show. Send the student
                  // to that city's page rather than an empty grid.
                  if (c.status !== 'live') router.push(`/property/${c.slug}`);
                }}
                className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left
                           transition-colors hover:bg-parchment active:bg-parchment/70"
              >
                <CityTile accent={c.accent} />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-night">{c.name}</span>
                  {c.status !== 'live' && (
                    <span className="block label-caps text-night/40">{t('comingSoon')}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        ))}
      </Popover>

      <span aria-hidden="true" className="h-8 w-px shrink-0 bg-night/10" />

      <Popover
        placement="bottom-end"
        className="w-auto p-4"
        trigger={
          <SegmentButton
            label={t('whenLabel')}
            value={dateLabel}
            placeholder={t('addDates')}
          />
        }
      >
        {/* The picker is injected so this component stays free of date maths
            and the caller owns the state. */}
        {renderDatePanel?.({ value: dates, onChange: onDatesChange })}
      </Popover>

      <button
        type="button"
        onClick={submit}
        aria-label={t('submit')}
        className="ml-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full
                   bg-blue text-white transition-[background-color,transform]
                   hover:bg-blue/90 active:scale-95"
      >
        <Icon name="search" className="h-4 w-4" />
      </button>
    </div>
  );
}
