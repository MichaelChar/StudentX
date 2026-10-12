'use client';

import { MAP_SCHOOLS } from '@/components/boarding/config';
import { SWISS_OUTLINE_PATH, SWISS_VIEWBOX } from '@/components/boarding/swissOutline';
import { fill, formatChf } from '@/lib/boardingPath';

const MINE = MAP_SCHOOLS.find((school) => school.mine) ?? MAP_SCHOOLS[0];

function bubbleSize(school) {
  return school.mine ? { w: 104, h: 26 } : { w: 46, h: 22 };
}

function bubbleText(school, strings) {
  if (school.mine) return fill(strings.map.mineBubble, { fee: '50k' });
  return `${Math.round(school.fee / 1000)}k`;
}

function bubbleLabel(school, strings) {
  const perYear = fill(strings.map.perYear, { amount: formatChf(school.fee) });
  if (school.mine) return `${strings.map.mineName}, ${perYear}`;
  return `${school.name}, ${school.town}, ${perYear}`;
}

function titleOf(school, strings) {
  return school.mine ? strings.map.mineName : school.name;
}

function townOf(school, strings) {
  return school.mine ? strings.map.mineTown : school.town;
}

function OverMore({ template, vars }) {
  const filled = fill(template, vars);
  const parts = filled.split(/<more>|<\/more>/);
  if (parts.length !== 3) return filled;
  return (
    <>
      {parts[0]}
      <strong className="whitespace-nowrap rounded-[4px] bg-yellow px-[5px] font-bold text-night">
        {parts[1]}
      </strong>
      {parts[2]}
    </>
  );
}

function activateKey(event, key, onSelect) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect(key);
}

/*
  Presentational fee map. Selection, interest and the ask-action live in
  LeadForm; this component only draws the Switzerland outline, price
  bubbles, and the detail card for `selected`.
*/
export default function FeeMap({
  strings,
  years,
  mode,
  selected,
  onSelect,
  interest,
  submitted,
  onAsk,
}) {
  const current = MAP_SCHOOLS.find((school) => school.key === selected) ?? MINE;
  const inInterest = interest.includes(current.key);
  const yearLabel = years > 0 ? strings.map.years[years] : '';

  return (
    <div className="grid gap-2.5">
      <div className="grid gap-0.5">
        <b className="text-[15px] font-semibold">{strings.map.title}</b>
        <span className="text-[12.5px] text-night/70">{strings.map.sub}</span>
      </div>
      {mode !== 'boarding' ? (
        <div className="rounded-xl bg-parchment px-3.5 py-3 text-sm">{strings.map.dayNote}</div>
      ) : null}
      <div className="rounded-[14px] bg-parchment">
        <svg viewBox={SWISS_VIEWBOX} role="group" aria-label={strings.map.aria} className="block h-auto w-full">
          <path
            d={SWISS_OUTLINE_PATH}
            className="fill-stone stroke-blue/40"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {MAP_SCHOOLS.map((school) => (
            <g key={`mark-${school.key}`} aria-hidden="true">
              <line
                x1={school.x}
                y1={school.y}
                x2={school.bx}
                y2={school.by}
                className="stroke-night opacity-35"
                strokeWidth="1"
              />
              {school.mine ? (
                <circle
                  cx={school.x}
                  cy={school.y}
                  r="7"
                  className="fill-none stroke-blue"
                  strokeWidth="1.2"
                  strokeDasharray="3 2"
                />
              ) : null}
              <circle
                cx={school.x}
                cy={school.y}
                r="3.5"
                className={school.mine ? 'fill-blue' : 'fill-night'}
              />
            </g>
          ))}
          {MAP_SCHOOLS.map((school) => {
            const { w, h } = bubbleSize(school);
            const isSelected = selected === school.key;
            return (
              <g
                key={school.key}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={bubbleLabel(school, strings)}
                className="group cursor-pointer outline-none"
                onClick={() => onSelect(school.key)}
                onKeyDown={(event) => activateKey(event, school.key, onSelect)}
              >
                <rect
                  x={school.bx - w / 2}
                  y={school.by - h / 2}
                  width={w}
                  height={h}
                  rx={h / 2}
                  className={
                    (school.mine
                      ? 'fill-blue group-hover:fill-blue/90 '
                      : 'fill-night ') +
                    (isSelected
                      ? 'stroke-yellow stroke-[3] '
                      : 'stroke-stone stroke-[1.5] ') +
                    'group-focus-visible:stroke-night group-focus-visible:stroke-[3]'
                  }
                />
                <text
                  x={school.bx}
                  y={school.by + 0.5}
                  className="fill-stone font-sans text-[11.5px] font-bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                >
                  {bubbleText(school, strings)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="grid gap-1 rounded-xl border border-night/12 px-3.5 py-3 text-sm" aria-live="polite">
        <div className="flex flex-wrap items-baseline justify-between gap-1 gap-x-2.5">
          <b className="text-[15px] font-semibold">{titleOf(current, strings)}</b>
          <span className="text-[12.5px] text-night/70">{townOf(current, strings)}</span>
        </div>
        <div className="font-semibold tabular-nums">
          {fill(strings.map.perYear, { amount: formatChf(current.fee) })}
        </div>
        {years > 0 && current.mine ? (
          <div className="tabular-nums">
            {fill(strings.map.over, {
              years: yearLabel,
              amount: formatChf(current.fee * years),
            })}
          </div>
        ) : null}
        {years > 0 && !current.mine ? (
          <div className="tabular-nums">
            <OverMore
              template={strings.map.overMore}
              vars={{
                years: yearLabel,
                amount: formatChf(current.fee * years),
                diff: formatChf((current.fee - MINE.fee) * years),
              }}
            />
          </div>
        ) : null}
        {!current.mine ? (
          <>
            <div className="text-xs text-night/70">
              {current.source === 'school' ? strings.map.sourceSchool : strings.map.sourceListed}
            </div>
            {inInterest ? (
              <div className="text-[13px] font-semibold text-jade">
                {submitted
                  ? fill(strings.map.added, { school: current.short })
                  : strings.map.noted}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onAsk(current.key)}
                className="justify-self-start rounded-[4px] bg-transparent p-0 py-1 text-[13.5px] font-semibold text-blue underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
              >
                {fill(strings.map.ask, { school: current.short })}
              </button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
