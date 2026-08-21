'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Divider from '@/components/ui/Divider';
import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { formatMoney, currencySymbol } from '@/lib/formatMoney';
import { maxBucketCount } from '@/lib/priceHistogram';
import {
  AMENITY_PREVIEW_COUNT,
  DURATION_MONTHS,
  EMPTY_VALUE,
  clearFilters,
  hasActiveFilters,
  isBucketInRange,
  isResultCountPending,
  normalizeOptions,
  parsePriceInput,
  resolveHistogram,
  splitAmenities,
  toggleInList,
} from '@/lib/filtersModal';

/*
  FiltersModal — Airbnb-structure filters dialog (parity Features 8 + 9).

  Pure UI. Not mounted anywhere yet: the results page still owns the
  sidebar, and the PR that deletes that sidebar is the one that renders
  this. Wiring it here would make both PRs unreviewable.

  Built on the F8 Modal primitive, so focus trap, scroll lock, Escape
  and the scrim come free. The Modal panel is a padded scrolling card;
  Feature 8 wants a 568×640 frame with a sticky header, sticky footer
  and a scrolling body BETWEEN them. Inline style beats the panel's
  `p-6 overflow-y-auto` (Tailwind source-order can't be trusted to
  win), and the body is `absolute inset-0 flex flex-col` so the split
  does not depend on Modal's inner wrapper growing.

  The measured shadow (`0 8px 28px rgba(0,0,0,.28)`) is the one
  Feature 8 copied off Airbnb. Modal.js itself uses a scrim and no
  elevation — "one shadow or a dimmed scrim, not both" — but Feature 8
  is an explicit founder measurement and supersedes that for this
  surface.

  Controlled: `value` / `onChange` fire on every toggle so a parent
  can live-update the Feature 9 count. The modal does not fetch
  distribution, count, or listings. `resultCount == null` renders a
  numberless "Show places" rather than "Show 0 places", which would
  read as no results while the count endpoint is still being built.

  Duration is a SegmentedControl of 1 / 5 / 9 months with none
  selected as the cleared state. Re-click-to-deselect is not wired:
  SegmentedControl is a radio group and does not fire onChange for the
  already-checked segment. Clear-all (and the parent resetting
  `minDuration`) is how duration clears. Flagged rather than forking
  the primitive.

  Motion: enter/exit is Modal's. The only local motion is a colour
  shift on histogram bars when the range moves, and a transform
  rotate on the Show-more chevron. No layout properties, no
  `transition-all`.
*/

const PANEL_STYLE = {
  width: 568,
  maxWidth: '100%',
  height: 640,
  maxHeight: 'calc(100vh - 2rem)',
  padding: 0,
  overflow: 'hidden',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.28)',
};

// Feature 9 wants a dark pill. Button's `primary` is iris, and adding a
// sixth variant for one call site would be a primitives PR. `!` beats
// the iris fill; hover/active follow Button's solid-fill vocabulary.
const APPLY_LOOK =
  'rounded-pill !bg-night !border-night text-stone ' +
  'hover:!bg-night/90 active:!bg-night/80';

const INPUT_LOOK =
  'w-full rounded-control border border-night/20 bg-white py-3 pl-8 pr-3 ' +
  'text-sm font-sans text-night ' +
  'transition-[background-color,border-color,color] ' +
  'hover:border-night/45 hover:bg-parchment ' +
  'active:bg-parchment/70 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

// Fixed skeleton silhouette — a right-skew typical of rent distributions.
// Not random: a random height would shimmer to a different shape every pulse.
const SKELETON_HEIGHTS = [
  0.3, 0.55, 0.7, 0.9, 1, 0.85, 0.6, 0.45, 0.35, 0.25, 0.2, 0.15,
];

function patchValue(value, partial) {
  return { ...EMPTY_VALUE, ...value, ...partial };
}

function PriceHistogram({
  histogram,
  minPrice,
  maxPrice,
  emptyLabel,
  barLabel,
}) {
  const { status, buckets } = histogram;

  if (status === 'pending') {
    // Hand-rolled rather than <Skeleton>: that primitive is a rounded
    // text bar and does not accept an origin-bottom scaleY. Same pulse
    // token (`animate-pulse` / reduced-motion none) so it still matches.
    return (
      <div className="h-12 flex items-end gap-0.5" aria-hidden="true">
        {SKELETON_HEIGHTS.map((h, i) => (
          <div key={i} className="relative flex-1 h-full">
            <div
              className="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-[2px] bg-parchment animate-pulse motion-reduce:animate-none"
              style={{ transform: `scaleY(${h})` }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <p className="text-[11px] text-night/40 font-sans">{emptyLabel}</p>
    );
  }

  const peak = maxBucketCount(buckets);

  return (
    <div className="h-12 flex items-end gap-0.5" aria-hidden="true">
      {buckets.map((b, i) => {
        const inRange = isBucketInRange(b, minPrice, maxPrice);
        const ratio = b.count > 0 ? Math.max(b.count / peak, 0.08) : 0;
        const title = barLabel
          ? barLabel({
              count: b.count,
              from: formatMoney(Math.round(b.from)),
              to: formatMoney(Math.round(b.to)),
            })
          : undefined;
        return (
          <div
            key={`${b.from}-${b.to}-${i}`}
            title={title}
            className="relative flex-1 h-full"
          >
            <div
              className={`absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-[2px] transition-[background-color] ${
                inRange ? 'bg-night' : 'bg-night/15'
              }`}
              style={{ transform: `scaleY(${ratio})` }}
            />
          </div>
        );
      })}
    </div>
  );
}

function FilterSection({ title, children }) {
  return (
    <section className="py-6">
      <h3 className="font-sans text-xl font-medium text-night leading-tight">
        {title}
      </h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function OptionChips({ options, selected, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const isOn = selected.includes(opt.value);
        return (
          <Chip
            key={String(opt.value)}
            selected={isOn}
            onClick={() => onToggle(opt.value)}
          >
            {opt.label}
          </Chip>
        );
      })}
    </div>
  );
}

export default function FiltersModal({
  open = false,
  onClose,
  value,
  onChange,
  onApply,
  onClearAll,
  resultCount,
  distribution,
  propertyTypes,
  neighborhoods,
  amenities,
  currency = 'EUR',
  className = '',
}) {
  const t = useTranslations('propylaea.filtersModal');
  const titleId = useId();
  const minId = useId();
  const maxId = useId();
  const [amenitiesExpanded, setAmenitiesExpanded] = useState(false);

  // Collapse "Show more" on each open so a previous session doesn't
  // leak an expanded amenities list into the next. The eslint suppression
  // matches results/page.js — this is a reset-on-open, not a derived store.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) setAmenitiesExpanded(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const filters = { ...EMPTY_VALUE, ...value };
  const types = normalizeOptions(propertyTypes);
  const places = normalizeOptions(neighborhoods);
  const amenityOptions = normalizeOptions(amenities);
  const { preview: amenityPreview, rest: amenityRest } =
    splitAmenities(amenityOptions, AMENITY_PREVIEW_COUNT);
  // Keep a selected amenity visible even if it lives behind Show more —
  // collapsing must not hide a chip the user just pressed.
  const shownAmenities = amenitiesExpanded
    ? amenityOptions
    : [
        ...amenityPreview,
        ...amenityRest.filter((opt) =>
          filters.selectedAmenities.includes(opt.value),
        ),
      ];
  const histogram = resolveHistogram(distribution);
  const symbol = currencySymbol(currency);
  const active = hasActiveFilters(filters);
  const countPending = isResultCountPending(resultCount);

  const durationOptions = DURATION_MONTHS.map((n) => ({
    value: n,
    label: t('durationMonth', { n }),
  }));

  function emit(partial) {
    onChange?.(patchValue(filters, partial));
  }

  function handleMinPrice(event) {
    const parsed = parsePriceInput(event.target.value);
    if (parsed.invalid) return;
    emit({ minPrice: parsed.value });
  }

  function handleMaxPrice(event) {
    const parsed = parsePriceInput(event.target.value);
    if (parsed.invalid) return;
    emit({ maxPrice: parsed.value });
  }

  function handleClearAll() {
    const next = clearFilters(filters);
    onChange?.(next);
    onClearAll?.(next);
  }

  function handleApply() {
    onApply?.(filters);
    onClose?.();
  }

  const applyLabel = countPending
    ? t('showPlacesPending')
    : t('showPlaces', { count: resultCount });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      aria-labelledby={titleId}
      className={`p-0 overflow-hidden ${className}`}
      style={PANEL_STYLE}
    >
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-stone rounded-modal">
        <header className="relative shrink-0 flex items-center justify-center px-16 py-4 border-b border-night/10 bg-stone">
          <div className="absolute left-4 top-1/2 -translate-y-1/2">
            <IconButton
              label={t('close')}
              size="sm"
              variant="ghost"
              onClick={onClose}
            >
              <Icon name="x" className="w-4 h-4" />
            </IconButton>
          </div>
          <h2
            id={titleId}
            className="font-sans text-base font-medium text-night"
          >
            {t('title')}
          </h2>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6">
          <FilterSection title={t('priceRange')}>
            <PriceHistogram
              histogram={histogram}
              minPrice={filters.minPrice}
              maxPrice={filters.maxPrice}
              emptyLabel={t('priceHistogramEmpty')}
              barLabel={(values) => t('priceHistogramBarLabel', values)}
            />
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={minId}
                  className="text-xs font-sans text-night/50"
                >
                  {t('priceMin')}
                </label>
                <div className="relative mt-1.5">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-night/50"
                    aria-hidden="true"
                  >
                    {symbol}
                  </span>
                  <input
                    id={minId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={filters.minPrice == null ? '' : String(filters.minPrice)}
                    onChange={handleMinPrice}
                    placeholder={t('priceMinPlaceholder')}
                    className={INPUT_LOOK}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor={maxId}
                  className="text-xs font-sans text-night/50"
                >
                  {t('priceMax')}
                </label>
                <div className="relative mt-1.5">
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-night/50"
                    aria-hidden="true"
                  >
                    {symbol}
                  </span>
                  <input
                    id={maxId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={filters.maxPrice == null ? '' : String(filters.maxPrice)}
                    onChange={handleMaxPrice}
                    placeholder={t('priceMaxPlaceholder')}
                    className={INPUT_LOOK}
                  />
                </div>
              </div>
            </div>
          </FilterSection>

          {types.length > 0 ? (
            <>
              <Divider decorative />
              <FilterSection title={t('typeOfPlace')}>
                <OptionChips
                  options={types}
                  selected={filters.selectedTypes}
                  onToggle={(v) =>
                    emit({ selectedTypes: toggleInList(filters.selectedTypes, v) })
                  }
                />
              </FilterSection>
            </>
          ) : null}

          <Divider decorative />
          <FilterSection title={t('duration')}>
            <SegmentedControl
              options={durationOptions}
              value={filters.minDuration}
              onChange={(next) => emit({ minDuration: next })}
              label={t('duration')}
              className="w-full [&>button]:flex-1"
            />
          </FilterSection>

          {amenityOptions.length > 0 ? (
            <>
              <Divider decorative />
              <FilterSection title={t('amenities')}>
                <OptionChips
                  options={shownAmenities}
                  selected={filters.selectedAmenities}
                  onToggle={(v) =>
                    emit({
                      selectedAmenities: toggleInList(
                        filters.selectedAmenities,
                        v,
                      ),
                    })
                  }
                />
                {amenityRest.length > 0 ? (
                  <Button
                    variant="tertiary"
                    size="sm"
                    className="mt-3"
                    aria-expanded={amenitiesExpanded}
                    onClick={() => setAmenitiesExpanded((openNow) => !openNow)}
                  >
                    {amenitiesExpanded ? t('showLess') : t('showMore')}
                    <Icon
                      name="chevronDown"
                      className={`w-4 h-4 transition-transform ${
                        amenitiesExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>
                ) : null}
              </FilterSection>
            </>
          ) : null}

          {places.length > 0 ? (
            <>
              <Divider decorative />
              <FilterSection title={t('neighbourhood')}>
                <OptionChips
                  options={places}
                  selected={filters.selectedNeighborhoods}
                  onToggle={(v) =>
                    emit({
                      selectedNeighborhoods: toggleInList(
                        filters.selectedNeighborhoods,
                        v,
                      ),
                    })
                  }
                />
              </FilterSection>
            </>
          ) : null}
        </div>

        <footer className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 border-t border-night/10 bg-stone">
          <Button
            variant="tertiary"
            size="md"
            onClick={handleClearAll}
            disabled={!active}
          >
            {t('clearAll')}
          </Button>
          <Button
            variant="primary"
            size="md"
            className={APPLY_LOOK}
            onClick={handleApply}
          >
            {applyLabel}
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
