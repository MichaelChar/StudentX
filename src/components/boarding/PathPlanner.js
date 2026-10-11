'use client';

import { useState, useSyncExternalStore } from 'react';
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

const AGE_OPTIONS = ENTRY_POINTS.map((entry) => ({
  value: entry.age,
  label: String(entry.age),
}));

// The school year never changes while the page is open; nothing to subscribe to.
const subscribeNoop = () => () => {};

function nodeDelay(index) {
  return { duration: 0.4, delay: index * 0.06, ease: EASE };
}

/*
  FLAG(review): the rail is two motion.spans, not one. scaleY is the vertical
  rail and scaleX is the horizontal one; each is shown at its breakpoint.
  A single span cannot switch the animated axis at 980px without reading the
  viewport during render, which hydrates wrong. The unused span is display:none.
*/
function Rail({ nodeCount }) {
  return (
    <>
      <motion.span
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={RAIL}
        className="pointer-events-none absolute top-[5px] bottom-[5px] left-[5px] z-0 w-0.5 origin-top bg-blue/20 min-[980px]:hidden"
      />
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={RAIL}
        style={{ right: `calc(${100 / nodeCount}% - 5px)` }}
        className="pointer-events-none absolute top-[5px] left-[5px] z-0 hidden h-0.5 origin-left bg-blue/20 min-[980px]:block"
      />
    </>
  );
}

/*
  FLAG(review): the dashed segment is the stretch leading into the optional
  applications step (the hollow dot), not the stretch after it.
*/
function DashedSegment() {
  return (
    <>
      <motion.span
        aria-hidden="true"
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: 1 }}
        viewport={{ once: true }}
        transition={RAIL}
        className="pointer-events-none absolute top-3 bottom-0 left-[5px] z-[1] w-0.5 origin-top border-l-2 border-dashed border-blue bg-parchment min-[980px]:hidden"
      />
      <motion.span
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={RAIL}
        className="pointer-events-none absolute top-[5px] right-0 left-3 z-[1] hidden h-0.5 origin-left border-t-2 border-dashed border-blue bg-parchment min-[980px]:block"
      />
    </>
  );
}

/* Covers the solid rail past the last dot. The card behind it is parchment. */
function RailEndMask() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute top-3 bottom-0 left-[5px] z-[1] w-0.5 bg-parchment min-[980px]:hidden"
      />
      <span
        aria-hidden="true"
        className="absolute top-[5px] right-0 left-3 z-[1] hidden h-0.5 bg-parchment min-[980px]:block"
      />
    </>
  );
}

/*
  Nodes are visible in the server HTML. They only fade in when the parent
  changes the age, so the dates never depend on JavaScript to be readable.
*/
function Timeline({ age, schoolYear, strings, animateIn }) {
  const entry = ENTRY_POINTS.find((item) => item.age === age);
  const { nodes } = buildPath(entry, schoolYear);

  return (
    <ol key={age} className="relative m-0 flex list-none flex-col p-0 min-[980px]:flex-row">
      <Rail nodeCount={nodes.length} />
      {nodes.map((node, index) => {
        const isLast = index === nodes.length - 1;
        const label = node.key === 'join' ? strings.join[age] : strings.nodes[node.key];
        const note = strings.notes[node.key];
        return (
          <li
            key={node.key}
            className="relative pb-8 pl-8 last:pb-0 min-[980px]:min-w-0 min-[980px]:flex-1 min-[980px]:pt-8 min-[980px]:pr-6 min-[980px]:pb-0 min-[980px]:pl-0 last:min-[980px]:pr-0"
          >
            {nodes[index + 1]?.optional ? <DashedSegment /> : null}
            {isLast ? <RailEndMask /> : null}
            <motion.span
              aria-hidden="true"
              initial={animateIn ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              transition={nodeDelay(index)}
              className={`absolute top-0 left-0 z-10 h-3 w-3 rounded-full ${
                node.optional ? 'border-2 border-blue bg-white' : 'bg-blue'
              }`}
            />
            <motion.div
              initial={animateIn ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={nodeDelay(index)}
            >
              <p className="font-display text-[17px] leading-tight">
                {node.schoolYear ? (
                  formatSchoolYear(node.schoolYear)
                ) : (
                  <time dateTime={`${node.year}-${MONTH_NUM[node.month]}`}>
                    {strings.months[node.month]} {node.year}
                  </time>
                )}
              </p>
              <p className="mt-1 text-[15px] text-night/70">{label}</p>
              {note ? (
                <p className="mt-1 text-[13px] leading-snug text-night/70">{note}</p>
              ) : null}
            </motion.div>
          </li>
        );
      })}
    </ol>
  );
}

function CostBars({ age, years, strings }) {
  const saving = fill(strings.saving, {
    amount: formatChf((FEE_TIERS_CHF.top - FEE_TIERS_CHF.value) * years),
  });

  return (
    <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-4">
      <p className="font-bold">{strings.years[age]}</p>
      <div className="flex flex-col gap-4">
        {TIERS.map((tier) => {
          const total = FEE_TIERS_CHF[tier] * years;
          const scale = total / (FEE_TIERS_CHF.top * 4);
          return (
            <div key={tier}>
              <p className="text-[13px] font-bold">{strings.tiers[tier]}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <div
                  aria-hidden="true"
                  className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-night/10"
                >
                  <div
                    className={`h-full w-full origin-left rounded-pill transition-transform duration-300 ease-parity motion-reduce:transition-none ${
                      tier === 'value' ? 'bg-blue' : 'bg-night/30'
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
      <p className="font-semibold">{saving}</p>
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
      <CostBars age={age} years={entry.years} strings={strings} />
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
