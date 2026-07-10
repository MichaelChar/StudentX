'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link, useRouter, usePathname } from '@/i18n/navigation';
import { RESOURCES } from '@/lib/resources/manifest.generated';
import {
  FACET_KEYS,
  deriveFacets,
  filterResources,
  getFacetOptions,
  relaxFilters,
  resourcesMatchingOtherFilters,
} from '@/lib/resources/facets';

const FACET_TITLES = {
  type: 'Resource type',
  semester: 'Semester',
  year: 'Year',
  country: 'Country',
};

function readFilters(searchParams) {
  return Object.fromEntries(FACET_KEYS.map((key) => [key, searchParams.get(key) || null]));
}

export default function ResourcesExplorer() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Tracks which facet the user most recently touched, so the never-empty
  // fallback drops the filter they just applied first (spec: "drop the
  // last-applied filter").
  const [lastChanged, setLastChanged] = useState(null);

  const filters = readFilters(searchParams);

  // visibleFacets decides *which* facet rows to render (based on full dataset
  // having >= 2 distinct values, per the original spec).
  const visibleFacets = useMemo(() => deriveFacets(RESOURCES), []);

  // displayFacets compute refined options + counts for each visible facet,
  // using only the resources that match the *other* active filters. This is
  // the "better UI" faceted search behavior: counts narrow, and unavailable
  // options for the current context disappear.
  const displayFacets = useMemo(() => {
    return visibleFacets.map((facet) => {
      const baseResources = resourcesMatchingOtherFilters(RESOURCES, filters, facet.key);
      const options = getFacetOptions(baseResources, facet.key);
      return { key: facet.key, options };
    });
  }, [visibleFacets, filters]);

  const setFilter = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams.toString());
      const isActive = filters[key] === value;
      if (isActive) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      setLastChanged(key);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, filters, router, pathname],
  );

  const exactMatches = filterResources(RESOURCES, filters);
  const hasActiveFilters = FACET_KEYS.some((key) => filters[key]);
  const showingRelaxed = hasActiveFilters && exactMatches.length === 0;

  const { results, droppedKey } = showingRelaxed
    ? relaxFilters(RESOURCES, filters, lastChanged)
    : { results: exactMatches, droppedKey: null };

  return (
    <div>
      {displayFacets.length > 0 && (
        <div className="flex flex-col gap-3 mb-5">
          {displayFacets.map((facet) => (
            <div
              key={facet.key}
              className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'rgba(10,37,64,0.4)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}
              >
                {FACET_TITLES[facet.key] ?? facet.key}
              </span>
              <div className="flex flex-wrap gap-1">
                {facet.options.map((opt) => {
                  const active = filters[facet.key] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFilter(facet.key, opt.value)}
                      className="transition-colors duration-150"
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 14px',
                        borderRadius: 999,
                        fontSize: 13,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        border: `1px solid ${active ? '#635BFF' : 'rgba(10,37,64,0.12)'}`,
                        background: active ? '#635BFF' : '#ffffff',
                        color: active ? '#ffffff' : '#0a2540',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label} · {opt.count}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showingRelaxed && (
        <p style={{ fontSize: 13, color: 'rgba(10,37,64,0.55)', marginBottom: 16 }}>
          No exact matches for the selected filters
          {droppedKey && droppedKey !== 'all' ? ` — showing results with "${FACET_TITLES[droppedKey] ?? droppedKey}" cleared.` : ' — showing all resources.'}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {results.map((resource) => (
          <ResourceCard key={resource.id} resource={resource} />
        ))}
      </div>
    </div>
  );
}

function metaLine(resource) {
  if (typeof resource.meta?.questionCount === 'number') {
    return `${resource.meta.questionCount} question${resource.meta.questionCount === 1 ? '' : 's'}`;
  }
  if (typeof resource.meta?.cardCount === 'number') {
    return `${resource.meta.cardCount} card${resource.meta.cardCount === 1 ? '' : 's'}`;
  }
  return null;
}

const CARD_CLASS =
  'block rounded-[18px] border border-night/10 bg-white p-5 shadow-[0_1px_3px_rgba(10,37,64,0.06),0_10px_28px_-12px_rgba(10,37,64,0.16)] transition-all duration-[220ms] ease-[cubic-bezier(.2,.7,.2,1)] hover:-translate-y-0.5 hover:border-blue hover:shadow-[0_22px_48px_-18px_rgba(99,91,255,0.30),0_6px_18px_-10px_rgba(10,37,64,0.10)]';
const CARD_STYLE = { textDecoration: 'none', color: '#0a2540' };

function ResourceCardBody({ resource, meta }) {
  return (
    <>
      <span
        style={{
          display: 'inline-block',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.3px',
          textTransform: 'uppercase',
          color: '#635BFF',
          marginBottom: 8,
        }}
      >
        {resource.type.replace('-', ' ')}
      </span>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, marginBottom: 6 }}>{resource.title}</h3>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, color: 'rgba(10,37,64,0.65)', margin: 0 }}>
        {resource.description}
      </p>
      {meta && (
        <p style={{ fontSize: 12, color: 'rgba(10,37,64,0.4)', marginTop: 10, marginBottom: 0 }}>{meta}</p>
      )}
    </>
  );
}

function ResourceCard({ resource }) {
  const meta = metaLine(resource);

  // Flashcard decks download the .apkg file directly (no intermediate
  // subject-page hop) — a plain anchor with `download`, mirroring DeckCard.
  if (resource.type === 'flashcard-deck') {
    return (
      <a href={resource.href} download className={CARD_CLASS} style={CARD_STYLE}>
        <ResourceCardBody resource={resource} meta={meta} />
      </a>
    );
  }

  return (
    <Link href={resource.href} className={CARD_CLASS} style={CARD_STYLE}>
      <ResourceCardBody resource={resource} meta={meta} />
    </Link>
  );
}
