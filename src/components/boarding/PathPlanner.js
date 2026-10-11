'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { animate, inView } from 'motion';
import { MotionConfig, motion } from 'motion/react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { CalButton } from '@/components/boarding/CalBooking';
import { DEFAULT_AGE, ENTRY_POINTS, FEE_TIERS_CHF } from '@/components/boarding/config';
import { BTN_PRIMARY } from '@/components/boarding/styles';
import {
  buildPath,
  currentSchoolYear,
  fill,
  formatChf,
  formatSchoolYear,
} from '@/lib/boardingPath';

const EASE = [0.455, 0.03, 0.515, 0.955];
const RAIL = { duration: 0.6, ease: EASE };
const MONTH_NUM = { sept: '09', may: '05', autumn: '10' };
const TIERS = ['value', 'mid', 'top'];

// Every programme year in order, MYP 4 → DP 2.
const LADDER = ENTRY_POINTS.map((entry) => entry.programme);

const AGE_OPTIONS = ENTRY_POINTS.map((entry) => ({
  value: entry.age,
  label: String(entry.age),
}));

// The school year never changes while the page is open; nothing to subscribe to.
const subscribeNoop = () => () => {};

function nodeDelay(index) {
  return { duration: 0.4, delay: index * 0.06, ease: EASE };
}

function NodeDot({ node, index, animateIn, className = '' }) {
  return (
    <motion.span
      aria-hidden="true"
      initial={animateIn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={nodeDelay(index)}
      className={`z-10 h-3 w-3 rounded-full ${
        node.optional ? 'border-2 border-blue bg-white' : 'bg-blue'
      } ${className}`}
    />
  );
}

/*
  Date + label for one step. Labels are deliberately short (founder's
  wording, 2026-10-11): age 14 has seven steps across the desktop width. The
  long university statistic is rendered once, under the whole timeline (see
  Timeline), so it never widens or lengthens a single step.
*/
function stepLabel(node, age, strings) {
  if (node.kind === 'join') return strings.join[age];
  if (node.kind === 'up') return strings.moveUp[node.programme];
  return strings.nodes[node.kind];
}

function NodeText({ node, age, strings }) {
  const label = stepLabel(node, age, strings);
  return (
    <>
      <p className="font-display text-[17px] leading-tight whitespace-nowrap">
        {node.schoolYear ? (
          formatSchoolYear(node.schoolYear)
        ) : (
          <time dateTime={`${node.year}-${MONTH_NUM[node.month]}`}>
            {strings.months[node.month]} {node.year}
          </time>
        )}
      </p>
      <p className="mt-1 text-[15px] text-night/70">{label}</p>
    </>
  );
}

/*
  Phones: a vertical list with a yellow rail down the left. Yellow (the
  photo's yellow) at 3px: a 2px yellow rail on parchment measured 1.39:1 and
  all but disappeared. The stretch leading INTO the optional applications
  step is dashed, and a parchment mask hides the rail past the last dot.
*/
function TimelineVertical({ age, nodes, strings, animateIn }) {
  return (
    <ol key={age} className="relative m-0 flex list-none flex-col p-0 min-[980px]:hidden">
      <motion.span
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={RAIL}
        className="pointer-events-none absolute top-[5px] bottom-[5px] left-[4.5px] z-0 w-[3px] origin-top bg-yellow"
      />
      {nodes.map((node, index) => (
        <li key={node.key} className="relative pb-8 pl-8 last:pb-0">
          {nodes[index + 1]?.optional ? (
            <motion.span
              aria-hidden="true"
              initial={{ scaleY: 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={RAIL}
              className="pointer-events-none absolute top-3 bottom-0 left-[4.5px] z-[1] w-[3px] origin-top border-l-[3px] border-dashed border-yellow bg-parchment"
            />
          ) : null}
          {index === nodes.length - 1 ? (
            <span
              aria-hidden="true"
              className="absolute top-3 bottom-0 left-[4.5px] z-[1] w-[3px] bg-parchment"
            />
          ) : null}
          <NodeDot node={node} index={index} animateIn={animateIn} className="absolute top-0 left-0" />
          <motion.div
            initial={animateIn ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={nodeDelay(index)}
          >
            <NodeText node={node} age={age} strings={strings} />
          </motion.div>
        </li>
      ))}
    </ol>
  );
}

/*
  Desktop: edge to edge (founder's call, 2026-10-11). The first dot sits on
  the left edge, the last on the right edge, the rest evenly between. Text is
  laid out on a grid of half-columns, one boundary per dot. Each middle step
  is centred across the two half-columns either side of its dot; the first
  step gets the first half-column, left-aligned, and the last step the last
  one, right-aligned. So no two steps share space, however many there are.

  At seven steps a half-column is only ~61-73px, so the first and last labels
  wrap ("University / starts!"). Their dates never wrap: those two steps are
  flex columns aligned to their outer edge, so a date wider than its
  half-column spills INWARD (flex-end overflows toward the start), never past
  the card edge. Measured at 980-1600px for every age: no step's text touches
  its neighbour's.

  Dots and rail live in a box inset by the dot radius (6px), so a dot at p%
  of that box is centred exactly over the p% grid boundary below it.
*/
function TimelineHorizontal({ age, nodes, strings, active, animateIn }) {
  const last = nodes.length - 1;
  const pct = (i) => (last === 0 ? 0 : (i / last) * 100);
  const halves = Math.max(1, 2 * last);
  const rail = nodes.slice(0, -1).map((node, i) => (
    <span
      key={node.key}
      style={{ left: `${pct(i)}%`, width: `${pct(i + 1) - pct(i)}%` }}
      className={`absolute top-[4.5px] ${
        nodes[i + 1].optional
          ? 'h-0 border-t-[3px] border-dashed border-yellow'
          : 'h-[3px] bg-yellow'
      }`}
    />
  ));

  return (
    <div
      aria-hidden={active ? undefined : 'true'}
      className={`[grid-area:1/1] ${active ? '' : 'invisible'}`}
    >
      <div aria-hidden="true" className="relative h-3">
        <div className="absolute inset-y-0 right-[6px] left-[6px]">
          {active ? (
            <motion.div
              key={age}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={RAIL}
              className="absolute inset-0 origin-left"
            >
              {rail}
            </motion.div>
          ) : (
            <div className="absolute inset-0">{rail}</div>
          )}
          {nodes.map((node, i) => (
            <span
              key={node.key}
              style={{ left: `${pct(i)}%` }}
              className="absolute top-0 -translate-x-1/2"
            >
              <NodeDot node={node} index={i} animateIn={active && animateIn} className="block" />
            </span>
          ))}
        </div>
      </div>
      <ol
        className="mt-5 grid list-none gap-x-3 p-0"
        style={{ gridTemplateColumns: `repeat(${halves}, minmax(0, 1fr))` }}
      >
        {nodes.map((node, i) => {
          const column =
            i === 0 ? '1 / 2' : i === last ? `${halves} / ${halves + 1}` : `${2 * i} / ${2 * i + 2}`;
          const align =
            i === 0
              ? 'flex flex-col items-start text-left'
              : i === last
                ? 'flex flex-col items-end text-right'
                : 'text-center';
          return (
            <li key={node.key} style={{ gridColumn: column }} className={align}>
              <motion.div
                initial={active && animateIn ? { opacity: 0, y: 8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={nodeDelay(i)}
              >
                <NodeText node={node} age={age} strings={strings} />
              </motion.div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/*
  Nodes are visible in the server HTML. They only fade in when the parent
  changes the age, so the dates never depend on JavaScript to be readable.

  Desktop renders every age's timeline stacked in one grid cell, with only
  the selected one visible: the cell is as tall as the tallest, so switching
  age (4 steps vs 5 changes how text wraps) never moves the cost bars below.
  Phones show only the selected age; a vertical list growing by one step
  reads as content, not as a jump.
*/
function Timeline({ age, schoolYear, strings, animateIn }) {
  const pathFor = (entryAge) =>
    buildPath(ENTRY_POINTS.find((item) => item.age === entryAge), schoolYear, LADDER).nodes;

  return (
    <div>
      <TimelineVertical age={age} nodes={pathFor(age)} strings={strings} animateIn={animateIn} />
      <div className="hidden min-[980px]:grid">
        {ENTRY_POINTS.map((entry) => (
          <TimelineHorizontal
            key={`${entry.age}-${entry.age === age}`}
            age={entry.age}
            nodes={pathFor(entry.age)}
            strings={strings}
            active={entry.age === age}
            animateIn={animateIn}
          />
        ))}
      </div>
      <p className="mt-6 max-w-[46rem] text-[15px] text-night/70">{strings.notes.uni}</p>
    </div>
  );
}

// Seconds for the longest (ultra-luxurious) bar to grow; the others take
// proportionally less.
const GROW_SECONDS = 1.6;

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Grows every bar from nothing at the SAME speed, so Michael's school finishes
// first, then mid-range, while the ultra-luxurious bar keeps going.
function raceBars(box) {
  return [...box.querySelectorAll('[data-scale]')].map((bar) => {
    const scale = Number(bar.dataset.scale);
    return animate(
      bar,
      { transform: ['scaleX(0)', `scaleX(${scale})`] },
      { duration: GROW_SECONDS * scale, ease: 'linear' },
    );
  });
}

/*
  Bars compare the three fees to each other — the ultra-luxurious fee is the
  full width — so they look the same at every age; only the totals change.

  The race runs the first time the bars scroll into view, and again every time
  the parent picks an age (founder's call: it is what shows the difference).
  Same progressive enhancement as StepCards: the server HTML has the final
  widths, and the first-view effect only empties them if they start below the
  fold and motion is allowed.
*/
function CostBars({ age, years, strings, replay }) {
  const barsRef = useRef(null);
  const playedRef = useRef(false);
  const saving = fill(strings.saving, {
    amount: formatChf((FEE_TIERS_CHF.top - FEE_TIERS_CHF.value) * years),
  });

  // First time on screen.
  useEffect(() => {
    const box = barsRef.current;
    if (!box || prefersReducedMotion()) return undefined;
    // Already on screen (e.g. reload mid-page): leave them drawn.
    if (box.getBoundingClientRect().top < window.innerHeight) return undefined;
    const bars = [...box.querySelectorAll('[data-scale]')];
    bars.forEach((bar) => {
      bar.style.transform = 'scaleX(0)';
    });
    const stop = inView(
      box,
      () => {
        if (playedRef.current) return;
        playedRef.current = true;
        raceBars(box);
      },
      { amount: 0.6 },
    );
    return () => {
      stop();
      bars.forEach((bar) => {
        bar.style.transform = `scaleX(${bar.dataset.scale})`;
      });
    };
  }, []);

  // Every age change after the first interaction.
  useEffect(() => {
    const box = barsRef.current;
    if (!replay || !box || prefersReducedMotion()) return undefined;
    playedRef.current = true;
    const runs = raceBars(box);
    return () => runs.forEach((run) => run.stop());
  }, [age, replay]);

  return (
    <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-4">
      <p className="font-bold">{strings.years[age]}</p>
      <div ref={barsRef} className="flex flex-col gap-4">
        {TIERS.map((tier) => {
          const total = FEE_TIERS_CHF[tier] * years;
          const scale = FEE_TIERS_CHF[tier] / FEE_TIERS_CHF.top;
          return (
            <div key={tier}>
              <p className="text-[13px] font-bold">{strings.tiers[tier]}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-night/10"
                >
                  <div
                    data-scale={scale}
                    className={`h-full w-full origin-left rounded-pill ${
                      tier === 'value' ? 'bg-yellow' : 'bg-night/30'
                    }`}
                    style={{ transform: `scaleX(${scale})` }}
                  />
                </div>
                <p className="min-w-[8.5rem] shrink-0 text-right font-display tabular-nums">
                  {formatChf(total)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="font-semibold">
        <span className="rounded-[4px] bg-yellow px-1.5 py-0.5 box-decoration-clone">{saving}</span>
      </p>
    </div>
  );
}

function Planner({ buildSchoolYear, strings }) {
  const [age, setAge] = useState(DEFAULT_AGE);
  const [changed, setChanged] = useState(false);
  const schoolYear = useSyncExternalStore(
    subscribeNoop,
    () => currentSchoolYear(new Date()),
    () => buildSchoolYear,
  );
  const entry = ENTRY_POINTS.find((item) => item.age === age);

  return (
    <div className="flex flex-col gap-8 rounded-[28px] bg-parchment p-6 min-[980px]:p-9">
      <div>
        {/* The radiogroup already exposes this string as its accessible name. */}
        <p className="mb-3 text-[15px] font-semibold" aria-hidden="true">
          {strings.ageLabel}
        </p>
        <SegmentedControl
          label={strings.ageLabel}
          value={age}
          onChange={(next) => {
            setAge(next);
            setChanged(true);
          }}
          options={AGE_OPTIONS}
        />
      </div>
      <Timeline age={age} schoolYear={schoolYear} strings={strings} animateIn={changed} />
      <CostBars age={age} years={entry.years} strings={strings} replay={changed} />
      <div>
        <CalButton className={BTN_PRIMARY}>
          {strings.cta}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="h-4 w-4"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </CalButton>
        <p className="mt-2 text-[13px] text-night/70">{strings.ctaNote}</p>
        <p className="mt-1 text-[13px] text-night/70">{strings.summaryPdf}</p>
      </div>
    </div>
  );
}

export default function PathPlanner({ buildSchoolYear, strings }) {
  return (
    <MotionConfig reducedMotion="user">
      <Planner buildSchoolYear={buildSchoolYear} strings={strings} />
    </MotionConfig>
  );
}
