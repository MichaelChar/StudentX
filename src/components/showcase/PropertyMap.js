'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import FeaturedCard from './FeaturedCard';
import { MAP_PINS, NEIGHBOURHOODS } from '@/lib/showcase/properties';

/*
  The Map page: a schematic of central Thessaloniki with the properties
  pinned, filterable by neighbourhood, with a List mode that reuses the
  Featured-properties card. All strings arrive as props from the server page.
  Filtered-out items are not rendered (not display:none).
*/
export default function PropertyMap({ properties, labels, rowText, cards, pinLabels }) {
  const [hood, setHood] = useState('');
  const [mode, setMode] = useState('map');
  const visible = properties.filter((p) => !hood || p.neighbourhood === hood);

  return (
    <>
      <div className="filters">
        <label htmlFor="hood">
          {labels.neighbourhood}
          <select id="hood" value={hood} onChange={(e) => setHood(e.target.value)}>
            <option value="">{labels.all}</option>
            {NEIGHBOURHOODS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="toggle" role="group" aria-label={labels.view}>
          <button type="button" aria-pressed={mode === 'map'} onClick={() => setMode('map')}>
            {labels.mapMode}
          </button>
          <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>
            {labels.listMode}
          </button>
        </div>
      </div>

      <div className="map-wrap" hidden={mode !== 'map'}>
        <svg viewBox="8 40 184 150" role="img" aria-label={labels.mapLabel}>
          <path d="M -10 134 Q 30 124 70 138 Q 110 152 150 168 Q 180 180 210 200 L 210 230 L -10 230 Z" fill="#000" fillOpacity=".06" />
          <path d="M 12 118 L 12 138 L 50 138 L 50 130 L 38 130 L 38 124 L 24 124 L 24 118 Z" fill="#000" fillOpacity=".05" stroke="#000" strokeOpacity=".5" strokeWidth=".7" />
          <path d="M -8 124 L 12 124 L 12 138 L 50 138 Q 80 144 110 154 Q 145 167 175 178 Q 195 184 210 192" fill="none" stroke="#000" strokeWidth="1" />
          <g fill="none" stroke="#000" strokeLinecap="round" strokeOpacity=".32" strokeWidth=".7">
            <path d="M 50 134 Q 80 140 110 150 Q 145 162 178 174" />
            <path d="M 22 122 Q 56 124 92 132 Q 128 142 168 158" />
            <path d="M 22 114 Q 58 116 96 124 Q 132 134 172 150" />
            <path d="M 22 106 Q 58 108 96 116 Q 132 126 172 142" />
            <path d="M 18 98 Q 56 100 96 108 Q 134 118 178 134" />
            <path d="M 18 88 Q 56 90 96 98 Q 134 108 178 124" />
            <path d="M 22 78 Q 60 80 100 88 Q 138 98 178 114" />
            <path d="M 30 68 Q 70 70 110 78 Q 145 86 178 100" />
            <path d="M 47 134 L 52 70" />
            <path d="M 66 132 L 72 68" />
            <path d="M 78 134 L 86 64" />
            <path d="M 90 138 L 98 70" />
            <path d="M 108 142 L 116 78" />
            <path d="M 130 154 L 136 96" />
            <path d="M 148 162 L 152 102" />
            <path d="M 38 64 L 52 58 L 78 54 L 110 54 L 138 58 L 158 66 L 168 78 L 168 92" strokeDasharray="2 1.2" strokeOpacity=".6" />
          </g>
          <path d="M 118 88 L 152 88 L 154 110 L 120 112 Z" fill="#000" fillOpacity=".1" stroke="#000" strokeOpacity=".4" strokeWidth=".6" />
          <text x="126" y="101" fontFamily="inherit" fontSize="5" fill="#000" fillOpacity=".55" letterSpacing=".6">
            {labels.university}
          </text>
          <g fontFamily="inherit" fontSize="5.4" letterSpacing=".7" fill="#000">
            {visible.map((p) => {
              const pin = MAP_PINS[p.num];
              if (!pin) return null;
              return (
                <Link key={p.num} className="pin" href={`/featured-properties/${p.num}`} aria-label={pinLabels[p.num]}>
                  <rect x={pin.x} y={pin.y} width="5" height="5" />
                  <text x={pin.labelEnd ? pin.x - 3.5 : pin.x + 8.5} y={pin.y + 4.5} textAnchor={pin.labelEnd ? 'end' : undefined}>
                    {p.num}
                  </text>
                </Link>
              );
            })}
          </g>
        </svg>
        <div className="mlist">
          {visible.map((p) => (
            <Link key={p.num} className="mrow" href={`/featured-properties/${p.num}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- images.unoptimized */}
              <img src={p.photos[0].src} width={p.photos[0].w} height={p.photos[0].h} alt="" loading="lazy" decoding="async" />
              <div>
                <b>{p.num}</b>
                <small>{rowText[p.num]}</small>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="fgrid" hidden={mode !== 'list'}>
        {visible.map((p) => (
          <FeaturedCard key={p.num} property={p} size={cards[p.num].size} layout={cards[p.num].layout} location={cards[p.num].location} />
        ))}
      </div>
    </>
  );
}
