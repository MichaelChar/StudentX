'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { COUNTRIES, propertyHref } from '@/lib/cityRoutes';

const GlobeLoader = dynamic(() => import('@/components/GlobeLoader'), { ssr: false });

// Multi-country hub diagram — port of `NeuralNetLanding` (stripe theme
// only) from the Claude Design wireframe bundle. Renders the
// hub → country → city neural-net SVG over the animated globe canvas
// (mounted by the parent), with a search input below.
//
// Interaction:
//   • Hover a city → its hub→country→city path highlights, everything
//     else dims; the search row swaps for a "→ Country / City" hint.
//   • Click a real city → router.push to /property/<slug>.
//   • Type in the search → first city matching by startsWith (then
//     includes) on its normalised name highlights.
//   • Diagram-only ghost rows (one per non-Greek country, "coming
//     soon…") render dashed and ignore clicks.

// ── Stripe theme (only theme we ship — see plan #4 'Out of scope') ──
const T = {
  bg: '#ffffff',
  ink: '#0a2540',
  inkSoft: 'rgba(10,37,64,0.65)',
  inkDim: 'rgba(10,37,64,0.45)',
  edge: 'rgba(99,91,255,0.22)',
  edgeDim: 'rgba(99,91,255,0.08)',
  edgeActive: 'url(#stripe-grad)',
  edgeActiveSolid: '#635BFF',
  node: '#ffffff',
  nodeStroke: 'rgba(99,91,255,0.35)',
  nodeText: '#0a2540',
  nodeSoonStroke: 'rgba(10,37,64,0.18)',
  nodeSoonText: 'rgba(10,37,64,0.4)',
  hub: 'url(#stripe-grad)',
  hubText: '#ffffff',
  wordmarkFill: 'linear-gradient(120deg, #635BFF 0%, #ff5fa2 50%, #ff8a3d 100%)',
  wordmarkGlow: 'rgba(255,95,162,0.35)',
  xColor: '#ff5fa2',
  inputBg: 'rgba(99,91,255,0.04)',
  inputBorder: 'rgba(99,91,255,0.22)',
  font: '"Inter", "Helvetica Neue", system-ui, sans-serif',
};

const VB_W = 1180;
const VB_H = 620;
const COL_X = [60, 520, 980];

// Stable country ordering for the diagram (GR top → IE bottom).
const COUNTRY_ORDER = ['GR', 'CY', 'UK', 'IE'];

// Global stat — hardcoded to match the design exactly. Replace with a
// real student-count API in a follow-up (see plan 'Out of scope').
const GLOBAL_STUDENTS = 364;

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function curve(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export default function HubDiagram() {
  const t = useTranslations('propylaea.hub');
  const router = useRouter();
  const [hovered, setHovered] = useState(null);
  const [search, setSearch] = useState('');
  const [globeLoading, setGlobeLoading] = useState(false);

  // Order countries; append per-country ghost row ("coming soon…") for
  // any non-Greek country with no second city yet. Ghost rows are
  // diagram-only — they aren't in cityRoutes, so they 404 if the user
  // typed the URL directly. Their `clickable: false` flag drops the
  // click handler at the SVG level.
  const orderedCountries = useMemo(() => {
    const ordered = COUNTRY_ORDER.map((code) =>
      COUNTRIES.find((c) => c.code === code),
    ).filter(Boolean);
    return ordered.map((country) => ({
      ...country,
      cities: [
        ...country.cities,
        ...(country.code !== 'GR'
          ? [
              {
                slug: `${country.code.toLowerCase()}-soon`,
                name: t('comingSoonGhost'),
                status: 'coming-soon',
                clickable: false,
                ghost: true,
              },
            ]
          : []),
      ],
    }));
  }, [t]);

  const countryNodes = orderedCountries.map((c, i) => ({
    ...c,
    x: COL_X[1],
    y: 60 + i * ((VB_H - 120) / (orderedCountries.length - 1)),
  }));

  const cityNodes = useMemo(() => {
    const totalCities = orderedCountries.reduce((s, c) => s + c.cities.length, 0);
    const out = [];
    let idx = 0;
    orderedCountries.forEach((country, ci) => {
      const cn = countryNodes[ci];
      country.cities.forEach((city) => {
        const y = 40 + idx * ((VB_H - 80) / (totalCities - 1));
        out.push({
          ...city,
          country,
          countryNode: cn,
          x: COL_X[2],
          y,
        });
        idx++;
      });
    });
    return out;
  }, [orderedCountries, countryNodes]);

  const hub = { x: COL_X[0], y: VB_H / 2 };

  const searchKey = normalize(search);
  const searchedCity = searchKey
    ? cityNodes.find(
        (c) => !c.ghost && normalize(c.name).startsWith(searchKey),
      ) || cityNodes.find((c) => !c.ghost && normalize(c.name).includes(searchKey))
    : null;

  const hoveredCity = hovered
    ? cityNodes.find((c) => `${c.slug}-${c.country.code}` === hovered)
    : null;
  const activeCity = hoveredCity || searchedCity;
  const activeCountryCode = activeCity ? activeCity.country.code : null;
  const anyActive = !!activeCity;

  const isHubCountryActive = (cc) => activeCountryCode === cc;
  const isCountryCityActive = (cc, slug) =>
    activeCity && activeCity.country.code === cc && activeCity.slug === slug;

  const handleGlobeComplete = useCallback(() => {
    router.push(propertyHref('thessaloniki'));
  }, [router]);

  const onCityClick = (city) => {
    if (!city.clickable && city.clickable !== undefined) return;
    if (city.ghost) return;
    if (city.slug === 'thessaloniki') {
      setGlobeLoading(true);
      return;
    }
    router.push(propertyHref(city.slug));
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 64px)',
        position: 'relative',
        zIndex: 2,
        color: T.ink,
        fontFamily: T.font,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header row — wordmark + global student count */}
      <div
        style={{
          padding: '32px 56px 0',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 40,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: '-2.5px',
            margin: 0,
            lineHeight: 1,
            background: T.wordmarkFill,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            textShadow: 'none',
          }}
        >
          Student
          <span
            style={{
              background: T.wordmarkFill,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
              fontStyle: 'italic',
            }}
          >
            X
          </span>
        </h1>
        <div style={{ textAlign: 'right', paddingBottom: 6 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: T.nodeText,
              lineHeight: 1.4,
            }}
          >
            {t('headerStat')}
          </div>
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: T.nodeText,
              lineHeight: 1,
              marginTop: 6,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-1.5px',
            }}
          >
            {GLOBAL_STUDENTS.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Diagram */}
      <div
        style={{
          padding: '32px 56px 32px',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="xMinYMid meet"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transition: 'all 0.4s cubic-bezier(0.7,0,0.2,1)',
            }}
          >
            <defs>
              <filter id="hub-glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="hub-glow-strong" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="stripe-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#635BFF" />
                <stop offset="50%" stopColor="#ff5fa2" />
                <stop offset="100%" stopColor="#ff8a3d" />
              </linearGradient>
            </defs>

            {/* Hub → country edges */}
            {countryNodes.map((cn) => {
              const active = isHubCountryActive(cn.code);
              return (
                <path
                  key={`hc-${cn.code}`}
                  d={curve(hub.x, hub.y, cn.x, cn.y)}
                  stroke={active ? T.edgeActive : anyActive ? T.edgeDim : T.edge}
                  strokeWidth={active ? 3.5 : 1.5}
                  fill="none"
                  filter={active ? 'url(#hub-glow)' : undefined}
                  style={{ transition: 'stroke 0.25s, stroke-width 0.25s' }}
                />
              );
            })}

            {/* Country → city edges */}
            {cityNodes.map((city) => {
              const active = isCountryCityActive(city.country.code, city.slug);
              const dim = anyActive && !active;
              return (
                <path
                  key={`cc-${city.country.code}-${city.slug}`}
                  d={curve(city.countryNode.x, city.countryNode.y, city.x, city.y)}
                  stroke={active ? T.edgeActive : dim ? T.edgeDim : T.edge}
                  strokeWidth={active ? 3.5 : 1.5}
                  fill="none"
                  filter={active ? 'url(#hub-glow)' : undefined}
                  style={{ transition: 'stroke 0.25s, stroke-width 0.25s' }}
                />
              );
            })}

            {/* Hub */}
            <g>
              <circle
                cx={hub.x}
                cy={hub.y}
                r={36}
                fill={T.hub}
                opacity={anyActive ? 1 : 0.95}
                filter="url(#hub-glow-strong)"
                style={{ transition: 'opacity 0.25s' }}
              />
              <circle
                cx={hub.x}
                cy={hub.y}
                r={36}
                fill="none"
                stroke={T.ink}
                strokeWidth={1.5}
                opacity={0.5}
              />
              <text
                x={hub.x}
                y={hub.y + 5}
                textAnchor="middle"
                fill={T.hubText}
                fontSize={14}
                fontWeight={700}
                letterSpacing={1}
                fontFamily="monospace"
              >
                X
              </text>
              <text
                x={hub.x}
                y={hub.y + 62}
                textAnchor="middle"
                fill={T.nodeText}
                fontSize={13}
                fontWeight={400}
                fontFamily={T.font}
              >
                StudentX
              </text>
            </g>

            {/* Country nodes */}
            {countryNodes.map((cn) => {
              const active = isHubCountryActive(cn.code);
              const dim = anyActive && !active;
              return (
                <g
                  key={`c-${cn.code}`}
                  style={{ transition: 'opacity 0.25s' }}
                  opacity={dim ? 0.4 : 1}
                >
                  <circle
                    cx={cn.x}
                    cy={cn.y}
                    r={active ? 20 : 16}
                    fill={active ? T.edgeActive : T.node}
                    stroke={active ? T.ink : T.nodeStroke}
                    strokeWidth={active ? 1.5 : 1}
                    filter={active ? 'url(#hub-glow)' : undefined}
                    style={{ transition: 'r 0.25s, fill 0.25s' }}
                  />
                  <text
                    x={cn.x}
                    y={cn.y + 3}
                    textAnchor="middle"
                    fill={active ? '#fff' : T.nodeText}
                    fontSize={10}
                    fontWeight={600}
                    fontFamily="monospace"
                  >
                    {cn.code}
                  </text>
                  <text
                    x={cn.x}
                    y={cn.y - 28}
                    textAnchor="middle"
                    fill={T.nodeText}
                    fontSize={13}
                    fontWeight={active ? 600 : 400}
                    fontFamily={T.font}
                  >
                    {cn.name}
                  </text>
                </g>
              );
            })}

            {/* City nodes */}
            {cityNodes.map((city) => {
              const active = isCountryCityActive(city.country.code, city.slug);
              const dim = anyActive && !active;
              const isGhost = !!city.ghost;
              const isSoon = city.status === 'coming-soon';
              const key = `${city.slug}-${city.country.code}`;
              const r = active ? 18 : 14;
              return (
                <g
                  key={`city-${key}`}
                  style={{
                    cursor: isGhost ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.25s',
                  }}
                  opacity={dim ? 0.35 : 1}
                  onMouseEnter={() => setHovered(key)}
                  onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                  onClick={() => onCityClick(city)}
                >
                  {/* Invisible padding hit-area for easier hover */}
                  <circle cx={city.x} cy={city.y} r={28} fill="transparent" />
                  <circle
                    cx={city.x}
                    cy={city.y}
                    r={r}
                    fill={active ? T.edgeActive : isSoon ? 'transparent' : T.node}
                    stroke={
                      active
                        ? T.ink
                        : isSoon
                          ? T.nodeSoonStroke
                          : T.nodeStroke
                    }
                    strokeWidth={active ? 1.5 : 1.2}
                    strokeDasharray={isSoon ? '3 3' : undefined}
                    filter={active ? 'url(#hub-glow)' : undefined}
                    style={{ transition: 'r 0.25s, fill 0.25s' }}
                  />
                  <text
                    x={city.x + 26}
                    y={city.y + 4}
                    fill={isSoon ? T.nodeSoonText : T.nodeText}
                    fontSize={13}
                    fontWeight={active ? 600 : 400}
                    fontFamily={T.font}
                    fontStyle={isSoon ? 'italic' : 'normal'}
                  >
                    {city.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hint + search — left-aligned with the StudentX header. */}
        <div
          style={{
            fontSize: 13,
            color: T.inkSoft,
            lineHeight: 1.6,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'flex-start',
          }}
        >
          {activeCity ? (
            <div style={{ flex: 'none', whiteSpace: 'nowrap' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: T.edgeActiveSolid,
                }}
              >
                → {activeCity.country.name} / {activeCity.name}
              </span>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: T.inputBg,
                border: `1px solid ${searchedCity ? T.edgeActiveSolid : T.inputBorder}`,
                borderRadius: 8,
                transition: 'border-color 0.2s, background 0.2s',
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.5 }}>⌕</span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: T.ink,
                  fontSize: 13,
                  fontFamily: 'inherit',
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: T.inkDim,
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 0,
                    lineHeight: 1,
                  }}
                  aria-label={t('clearSearch')}
                >
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {globeLoading && <GlobeLoader onComplete={handleGlobeComplete} />}
    </div>
  );
}
