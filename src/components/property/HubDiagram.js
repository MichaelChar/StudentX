'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import dynamic from 'next/dynamic';
import { COUNTRIES, propertyHref } from '@/lib/cityRoutes';

const GlobeLoader = dynamic(() => import('@/components/GlobeLoader'), { ssr: false });
const CityGlobeLoader = dynamic(() => import('@/components/CityGlobeLoader'), { ssr: false });

// Multi-country hub diagram — renders the hub → country → city neural-net
// SVG on desktop (≥1024 px) and a touch-friendly vertical city list below
// that (phones AND portrait tablets / landscape phones — the SVG's fixed
// 1180×620 viewBox shrinks to unreadable label sizes under ~1024 px wide).
// Both layouts are always in the DOM; CSS media queries toggle visibility
// so the correct layout shows from first paint with no hydration flash. The animated globe canvas (HubBackground) sits behind
// the diagram in the parent; per-city sub-trees keep their own Propylaea
// aesthetic untouched.

// ── Stripe theme ──
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
  wordmarkFill: 'linear-gradient(120deg, #635BFF 0%, #ff5fa2 50%, #ffcb57 100%)',
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

const GLOBAL_STUDENTS = 364;

function normalize(s) {
  return (s || '').toLowerCase().replace(/[^a-z]/g, '');
}

function curve(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

function SearchBar({ search, setSearch, activeCity, searchedCity, t, mobile }) {
  if (activeCity) {
    return (
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
    );
  }

  return (
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
      <span style={{ fontSize: 14, opacity: 0.5 }} aria-hidden="true">⌕</span>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={mobile ? t('searchPlaceholderMobile') : t('searchPlaceholder')}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: T.ink,
          fontSize: mobile ? 16 : 13,
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
  );
}

function MobileHubList({
  orderedCountries,
  activeCity,
  anyActive,
  isCountryCityActive,
  setHovered,
  onCityClick,
  search,
  setSearch,
  searchedCity,
  t,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        style={{
          fontSize: 13,
          color: T.inkSoft,
          lineHeight: 1.6,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          width: '100%',
        }}
      >
        <SearchBar
          search={search}
          setSearch={setSearch}
          activeCity={activeCity}
          searchedCity={searchedCity}
          t={t}
          mobile
        />
      </div>

      {orderedCountries.map((country) => (
        <div key={country.code} style={{ marginTop: 8 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0',
              borderBottom: '1px solid rgba(99,91,255,0.12)',
            }}
          >
            <span style={{ fontSize: 20 }}>{country.flag}</span>
            <span
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: T.nodeText,
                fontFamily: T.font,
                flex: 1,
              }}
            >
              {country.name}
            </span>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: 11,
                fontWeight: 600,
                color: T.inkSoft,
                background: 'rgba(99,91,255,0.08)',
                padding: '2px 8px',
                borderRadius: 4,
                letterSpacing: 1,
              }}
            >
              {country.code}
            </span>
          </div>

          {country.cities.map((city) => {
            const key = `${city.slug}-${country.code}`;
            const isActive = isCountryCityActive(country.code, city.slug);
            const isGhost = !!city.ghost;
            const isSoon = city.status === 'coming-soon';
            const dim = anyActive && !isActive;

            if (isGhost) {
              return (
                <div
                  key={key}
                  aria-hidden="true"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                    minHeight: 48,
                    padding: '10px 4px 10px 15px',
                    opacity: 0.4,
                    fontFamily: T.font,
                    gap: 12,
                  }}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    style={{ flexShrink: 0 }}
                  >
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="transparent"
                      stroke={T.nodeSoonStroke}
                      strokeWidth={1.2}
                      strokeDasharray="3 3"
                    />
                  </svg>
                  <span
                    style={{
                      fontSize: 16,
                      color: T.nodeSoonText,
                      fontStyle: 'italic',
                    }}
                  >
                    {city.name}
                  </span>
                </div>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => onCityClick(city)}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered((h) => (h === key ? null : h))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  minHeight: 48,
                  padding: '10px 4px 10px 12px',
                  background: isActive
                    ? 'rgba(99,91,255,0.06)'
                    : 'transparent',
                  border: 'none',
                  borderLeft: isActive
                    ? `3px solid ${T.edgeActiveSolid}`
                    : '3px solid transparent',
                  cursor: 'pointer',
                  opacity: dim ? 0.4 : 1,
                  transition: 'opacity 0.25s, background 0.25s',
                  fontFamily: T.font,
                  gap: 12,
                  textAlign: 'left',
                }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  style={{ flexShrink: 0 }}
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill={
                      isActive
                        ? T.edgeActiveSolid
                        : isSoon
                          ? 'transparent'
                          : T.node
                    }
                    stroke={
                      isActive
                        ? T.ink
                        : isSoon
                          ? T.nodeSoonStroke
                          : T.nodeStroke
                    }
                    strokeWidth={isActive ? 1.5 : 1.2}
                    strokeDasharray={isSoon ? '3 3' : undefined}
                  />
                </svg>

                <span
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: isActive ? 600 : 400,
                    color: isSoon ? T.nodeSoonText : T.nodeText,
                  }}
                >
                  {city.name}
                </span>

                {isSoon ? (
                  <span
                    style={{
                      fontSize: 12,
                      color: T.nodeSoonText,
                      fontStyle: 'italic',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t('comingSoonLabel')}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: 16,
                      color: isActive ? T.edgeActiveSolid : T.inkDim,
                      fontWeight: 300,
                    }}
                  >
                    →
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function HubDiagram() {
  const t = useTranslations('propylaea.hub');
  const router = useRouter();
  const [hovered, setHovered] = useState(null);
  const [search, setSearch] = useState('');
  const [globeLoading, setGlobeLoading] = useState(null);

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
    if (globeLoading) router.push(propertyHref(globeLoading));
  }, [router, globeLoading]);

  const onCityClick = (city) => {
    if (!city.clickable && city.clickable !== undefined) return;
    if (city.ghost) return;
    setGlobeLoading(city.slug);
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
      <div className="px-5 pt-5 md:px-14 md:pt-8 flex items-end justify-between flex-wrap gap-4 md:gap-10">
        <h1
          className="text-[40px] md:text-[72px] tracking-[-1.5px] md:tracking-[-2.5px]"
          style={{
            fontWeight: 700,
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
        <div className="text-right pb-0.5 md:pb-1.5">
          <div
            className="text-xs md:text-[13px]"
            style={{
              fontWeight: 400,
              color: T.nodeText,
              lineHeight: 1.4,
            }}
          >
            {t('headerStat')}
          </div>
          <div
            className="text-4xl md:text-[56px] mt-1 md:mt-1.5"
            style={{
              fontWeight: 700,
              color: T.nodeText,
              lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-1.5px',
            }}
          >
            {GLOBAL_STUDENTS.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Diagram / city list container */}
      <div className="px-5 pt-4 pb-6 md:px-14 md:py-8 flex-1 min-h-0 flex flex-col gap-4">
        {/* ── Mobile / tablet: touch-friendly city list (<1024 px) ── */}
        <div className="lg:hidden">
          <MobileHubList
            orderedCountries={orderedCountries}
            activeCity={activeCity}
            anyActive={anyActive}
            isCountryCityActive={isCountryCityActive}
            setHovered={setHovered}
            onCityClick={onCityClick}
            search={search}
            setSearch={setSearch}
            searchedCity={searchedCity}
            t={t}
          />
        </div>

        {/* ── Desktop: neural-net SVG diagram (≥1024 px) ── */}
        <div className="hidden lg:block" style={{ flex: 1, position: 'relative', minHeight: 0 }}>
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
                <stop offset="100%" stopColor="#ffcb57" />
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

        {/* Desktop search bar */}
        <div
          className="hidden lg:flex"
          style={{
            fontSize: 13,
            color: T.inkSoft,
            lineHeight: 1.6,
            alignItems: 'center',
            gap: 20,
            width: '100%',
            maxWidth: 640,
            alignSelf: 'flex-start',
          }}
        >
          <SearchBar
            search={search}
            setSearch={setSearch}
            activeCity={activeCity}
            searchedCity={searchedCity}
            t={t}
            mobile={false}
          />
        </div>
      </div>
      {globeLoading === 'thessaloniki' && <GlobeLoader onComplete={handleGlobeComplete} />}
      {globeLoading && globeLoading !== 'thessaloniki' && (
        <CityGlobeLoader city={globeLoading} onComplete={handleGlobeComplete} />
      )}
    </div>
  );
}
