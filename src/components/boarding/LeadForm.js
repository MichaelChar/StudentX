'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { MotionConfig, motion, useReducedMotion } from 'motion/react';
import BauhausLoader from '@/components/BauhausLoader';
import { CalButton } from '@/components/boarding/CalBooking';
import { ENTRY_POINTS, MAP_SCHOOLS } from '@/components/boarding/config';
import FeeMap from '@/components/boarding/FeeMap';
import { BTN_PRIMARY } from '@/components/boarding/styles';
import {
  AGE_VALUES,
  CONTACT_METHODS,
  LEAD_LIMITS,
  MODES,
  contactKind,
  entryFor,
  isValidContact,
  monthKey,
  startOptions,
} from '@/lib/boardingLead';
import { fill, formatSchoolYear } from '@/lib/boardingPath';

const EASE = [0.455, 0.03, 0.515, 0.955];
const ADVANCE_MS = 220;
const LOADER_MS = 2100;
const UPDATE_MS = 800;
const PROGRESS = {
  start: 14,
  age: 32,
  mode: 50,
  choice: 66,
  about: 78,
  contact: 90,
  result: 100,
};
const BACK_OF = {
  age: 'start',
  mode: 'age',
  choice: 'mode',
  about: 'choice',
  contact: 'about',
};
const INPUT_BY_KIND = {
  phone: { type: 'tel', autoComplete: 'tel' },
  email: { type: 'email', autoComplete: 'email' },
  wechat: { type: 'text', autoComplete: 'off' },
};
const RUNG = ENTRY_POINTS.map((entry) => entry.programme);
const subscribeNoop = () => () => {};

const OPT =
  'flex min-h-[52px] items-center gap-3 rounded-control border-[1.5px] border-night/12 bg-stone ' +
  'py-3.5 pr-3.5 pl-4 text-left text-night transition-[border-color,background-color] duration-150 ease-parity ' +
  'hover:border-blue/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'aria-pressed:border-blue aria-pressed:bg-parchment';
const OPT_COMPACT =
  'flex min-h-[52px] items-center justify-center rounded-control border-[1.5px] border-night/12 bg-stone ' +
  'px-2 py-3 text-center text-night transition-[border-color,background-color] duration-150 ease-parity ' +
  'hover:border-blue/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'aria-pressed:border-blue aria-pressed:bg-parchment';
const INPUT =
  'w-full rounded-control border-[1.5px] border-night/12 bg-stone px-3 py-[11px] text-[15px] text-night ' +
  'placeholder:text-night/45 transition-[border-color] duration-150 ease-parity ' +
  'focus:border-blue focus:outline-none focus:ring-[3px] focus:ring-blue/15 ' +
  'aria-[invalid=true]:border-magenta-ink';
const METHOD =
  'rounded-pill border-[1.5px] border-night/12 bg-stone px-[13px] py-[7px] text-[13.5px] font-semibold text-night ' +
  'hover:border-blue/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ' +
  'aria-pressed:border-night aria-pressed:bg-night aria-pressed:text-white';

/*
  One id per form visit. crypto.randomUUID needs a recent browser and a
  secure context; getRandomValues does not, so it is the fallback (Safari
  before 15.4). Same v4 layout either way, which the endpoint checks.
*/
function newId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function postJson(payload) {
  try {
    const res = await fetch('/api/boarding/lead', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

function ageLabel(age, strings) {
  if (age === 13) return strings.age.under;
  if (age === 18) return strings.age.over;
  return String(age);
}

function startChipText(value, nowKey, strings) {
  const opt = startOptions(nowKey).find((item) => item.value === value);
  if (!opt) return '';
  if (opt.key === 'asap') return strings.chips.asap;
  if (opt.key === 'unsure') return strings.chips.unsure;
  return fill(strings.chips[opt.key], { year: opt.year });
}

function joinWhen(path, startValue, strings) {
  if (path.shifted) return fill(strings.chips.sept, { year: path.schoolYear });
  if (typeof startValue === 'string' && startValue.endsWith('-01')) {
    return fill(strings.chips.jan, { year: startValue.slice(0, 4) });
  }
  if (typeof startValue === 'string' && startValue.endsWith('-09')) {
    return fill(strings.chips.sept, { year: startValue.slice(0, 4) });
  }
  return formatSchoolYear(path.schoolYear);
}

function joinDateTime(path, startValue) {
  if (path.shifted) return `${path.schoolYear}-09`;
  if (typeof startValue === 'string' && /^\d{4}-01$/.test(startValue)) return startValue;
  if (typeof startValue === 'string' && /^\d{4}-09$/.test(startValue)) return startValue;
  return `${path.schoolYear}-09`;
}

function Arrow() {
  return (
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
  );
}

function Tick({ on }) {
  return (
    <span
      aria-hidden="true"
      className={
        'grid h-5 w-5 flex-none place-items-center rounded-full border-[1.5px] ' +
        (on ? 'border-blue bg-blue' : 'border-night/12')
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className={`h-3 w-3 text-white ${on ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function OptionButton({ selected, onClick, label, note, compact }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={compact ? OPT_COMPACT : OPT}
    >
      <span className={compact ? '' : 'min-w-0 flex-1'}>
        <b className="block text-[15px] font-semibold">{label}</b>
        {note ? (
          <small className="mt-px block text-[13px] font-normal text-night/70">{note}</small>
        ) : null}
      </span>
      {compact ? null : <Tick on={selected} />}
    </button>
  );
}

function Timeline({ path, startValue, strings }) {
  const startIdx = RUNG.indexOf(path.entry.programme);
  const rows = [
    {
      key: 'join',
      date: joinWhen(path, startValue, strings),
      dateTime: joinDateTime(path, startValue),
      label: fill(strings.timeline.join, { programme: path.entry.programme }),
      kind: 'solid',
    },
  ];
  for (let i = 1; i < path.entry.years; i += 1) {
    const year = path.schoolYear + i;
    rows.push({
      key: `up-${i}`,
      date: fill(strings.chips.sept, { year }),
      dateTime: `${year}-09`,
      label: fill(strings.timeline.moveUp, { programme: RUNG[startIdx + i] }),
      kind: 'solid',
    });
  }
  rows.push({
    key: 'apply',
    date: `${strings.timeline.months.autumn} ${path.examYear - 1}`,
    dateTime: `${path.examYear - 1}-10`,
    label: strings.timeline.apply,
    kind: 'hollow',
  });
  rows.push({
    key: 'exams',
    date: `${strings.timeline.months.may} ${path.examYear}`,
    dateTime: `${path.examYear}-05`,
    label: strings.timeline.exams,
    kind: 'solid',
  });
  rows.push({
    key: 'uni',
    date: `${strings.timeline.months.sept} ${path.examYear}`,
    dateTime: `${path.examYear}-09`,
    label: strings.timeline.uni,
    kind: 'uni',
  });

  return (
    <ol className="relative m-0 grid list-none p-0 before:absolute before:top-2.5 before:bottom-2.5 before:left-[5px] before:w-0.5 before:bg-iris-soft before:content-['']">
      {rows.map((row, index) => (
        <motion.li
          key={row.key}
          initial={{ opacity: 0, x: 14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.36, delay: index * 0.06, ease: EASE }}
          className="relative grid grid-cols-[12px_92px_minmax(0,1fr)] items-center gap-3 py-[7px] max-[480px]:grid-cols-[12px_88px_minmax(0,1fr)] max-[480px]:gap-2.5"
        >
          <span
            aria-hidden="true"
            className={
              row.kind === 'hollow'
                ? 'relative z-[1] h-3 w-3 rounded-full border-2 border-blue bg-stone'
                : row.kind === 'uni'
                  ? 'relative z-[1] h-3 w-3 rounded-full bg-yellow shadow-[0_0_0_3px_var(--color-night)]'
                  : 'relative z-[1] h-3 w-3 rounded-full bg-blue'
            }
          />
          <time dateTime={row.dateTime} className="text-[13px] font-semibold tabular-nums text-night/70">
            {row.date}
          </time>
          <span
            className={
              row.kind === 'hollow'
                ? 'text-[14.5px] font-medium text-night/70'
                : 'text-[14.5px] font-semibold'
            }
          >
            {row.label}
          </span>
        </motion.li>
      ))}
    </ol>
  );
}

export default function LeadForm({ strings, summaryPdf, buildMonth, source }) {
  const nowKey = useSyncExternalStore(
    subscribeNoop,
    () => monthKey(new Date()),
    () => buildMonth,
  );
  const reduced = useReducedMotion();
  const uid = useId();
  const nameErrId = `${uid}-name-err`;
  const contactErrId = `${uid}-contact-err`;

  const [screen, setScreen] = useState('start');
  const [dir, setDir] = useState('fwd');
  const [loading, setLoading] = useState(false);
  const [loaderKind, setLoaderKind] = useState('building');
  const [startValue, setStartValue] = useState(null);
  const [ageNow, setAgeNow] = useState(null);
  const [mode, setMode] = useState(null);
  const [path, setPath] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [method, setMethod] = useState('whatsapp');
  const [contactValue, setContactValue] = useState('');
  const [about, setAbout] = useState('');
  const [company, setCompany] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState('mine');
  const [schoolsViewed, setSchoolsViewed] = useState([]);
  const [interest, setInterest] = useState([]);
  const [nameError, setNameError] = useState('');
  const [contactError, setContactError] = useState('');
  const [sendError, setSendError] = useState('');

  const cardRef = useRef(null);
  const headingRef = useRef(null);
  const nameRef = useRef(null);
  const contactRef = useRef(null);
  const idRef = useRef(null);
  const skipFocus = useRef(true);
  const [enterReady, setEnterReady] = useState(false);
  const busyRef = useRef(false);
  const genRef = useRef(0);
  const advanceTimer = useRef(null);
  const loaderTimer = useRef(null);
  const updateReady = useRef(false);
  const skipNextUpdate = useRef(false);

  function ensureId() {
    if (!idRef.current) idRef.current = newId();
    return idRef.current;
  }

  function payload(event, extra = {}) {
    return {
      id: ensureId(),
      event,
      source,
      start: startValue,
      ageNow,
      mode,
      path,
      schoolsViewed,
      interest,
      firstName,
      contactMethod: method,
      contactValue,
      about,
      company,
      ...extra,
    };
  }

  function go(next, direction = 'fwd') {
    genRef.current += 1;
    busyRef.current = false;
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    setDir(direction);
    setScreen(next);
  }

  function scheduleAdvance(next) {
    if (busyRef.current) return;
    busyRef.current = true;
    const gen = genRef.current;
    advanceTimer.current = window.setTimeout(() => {
      if (gen !== genRef.current) return;
      busyRef.current = false;
      setDir('fwd');
      setScreen(next);
    }, ADVANCE_MS);
  }

  function pickStart(value) {
    if (busyRef.current) return;
    setStartValue(value);
    scheduleAdvance('age');
  }

  function pickAge(value) {
    if (busyRef.current) return;
    setAgeNow(value);
    scheduleAdvance('mode');
  }

  function pickMode(value) {
    if (busyRef.current) return;
    setMode(value);
    scheduleAdvance('choice');
  }

  function handleBack() {
    const prev = BACK_OF[screen];
    if (!prev || loading) return;
    go(prev, 'back');
  }

  function handleResources() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPath('resources');
    setLoaderKind('building');
    setLoading(true);
    const gen = genRef.current;
    loaderTimer.current = window.setTimeout(() => {
      if (gen !== genRef.current) return;
      busyRef.current = false;
      setLoading(false);
      setDir('fwd');
      setScreen('result');
      void postJson(payload('view', { path: 'resources' }));
    }, LOADER_MS);
  }

  // Records the answers now, so a parent who stops before Send still counts.
  function handlePersonalised() {
    setPath('personalised');
    go('about');
    void postJson(payload('view', { path: 'personalised' }));
  }

  async function handleSend() {
    if (busyRef.current) return;
    const nameOk = firstName.trim().length > 0;
    const contactOk = isValidContact(method, contactValue);
    const field = strings.contact.fields[contactKind(method)] ?? strings.contact.fields.phone;
    if (!nameOk || !contactOk) {
      setNameError(nameOk ? '' : strings.contact.nameError);
      setContactError(contactOk ? '' : field.error);
      if (!nameOk) nameRef.current?.focus();
      else contactRef.current?.focus();
      return;
    }
    busyRef.current = true;
    setSendError('');
    setLoaderKind('sending');
    setLoading(true);
    const body = payload('submit', { path: path ?? 'personalised' });
    const minWait = new Promise((resolve) => {
      loaderTimer.current = window.setTimeout(resolve, LOADER_MS);
    });
    const [ok] = await Promise.all([postJson(body), minWait]);
    if (!ok) {
      busyRef.current = false;
      setLoading(false);
      setSendError(strings.contact.error);
      return;
    }
    busyRef.current = false;
    setSubmitted(true);
    setLoading(false);
    setDir('fwd');
    setScreen('result');
  }

  function handleSelect(key) {
    setSelected(key);
    if (key === 'mine') return;
    setSchoolsViewed((prev) => (prev.includes(key) ? prev : [...prev, key]));
  }

  function handleAsk(key) {
    if (interest.includes(key)) return;
    const next = [...interest, key];
    setInterest(next);
    if (submitted) {
      skipNextUpdate.current = true;
      void postJson(payload('update', { interest: next }));
      return;
    }
    setPath('personalised');
    go('about');
    // Leaving the result screen stops the debounced update, so record the
    // interest now in case they stop before Send.
    void postJson(payload('view', { path: 'personalised', interest: next }));
  }

  function pickMethod(next) {
    const prevKind = contactKind(method);
    const nextKind = contactKind(next);
    setMethod(next);
    if (prevKind !== nextKind) {
      setContactValue('');
      setContactError('');
    }
  }

  useEffect(() => {
    return () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      if (loaderTimer.current) window.clearTimeout(loaderTimer.current);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      setEnterReady(true);
    })();
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    if (skipFocus.current) {
      skipFocus.current = false;
      return undefined;
    }
    headingRef.current?.focus({ preventScroll: true });
    const card = cardRef.current;
    if (card && card.getBoundingClientRect().top < 0) {
      card.scrollIntoView({
        block: 'start',
        behavior: reduced ? 'auto' : 'smooth',
      });
    }
    return undefined;
  }, [screen, loading, reduced]);

  useEffect(() => {
    if (screen !== 'result') {
      updateReady.current = false;
      return undefined;
    }
    if (!updateReady.current) {
      updateReady.current = true;
      return undefined;
    }
    if (skipNextUpdate.current) {
      skipNextUpdate.current = false;
      return undefined;
    }
    const body = {
      id: ensureId(),
      event: 'update',
      source,
      start: startValue,
      ageNow,
      mode,
      path,
      schoolsViewed,
      interest,
      firstName,
      contactMethod: method,
      contactValue,
      about,
      company,
    };
    const t = window.setTimeout(() => {
      void postJson(body);
    }, UPDATE_MS);
    return () => window.clearTimeout(t);
  }, [
    screen,
    schoolsViewed,
    interest,
    startValue,
    ageNow,
    mode,
    path,
    firstName,
    method,
    contactValue,
    about,
    company,
    source,
  ]);

  const starts = startOptions(nowKey);
  const kind = contactKind(method) ?? 'phone';
  const field = strings.contact.fields[kind];
  const inputMeta = INPUT_BY_KIND[kind] ?? INPUT_BY_KIND.wechat;
  const progress = loading
    ? Math.min(100, (PROGRESS[screen] ?? 0) + 8)
    : (PROGRESS[screen] ?? 0);
  const showBack = !loading && screen !== 'start' && screen !== 'result';
  const askedNames = interest
    .map((key) => MAP_SCHOOLS.find((school) => school.key === key)?.short)
    .filter(Boolean)
    .join(', ');

  const pathResult =
    screen === 'result' && startValue && ageNow
      ? entryFor({ ageNow, start: startValue, nowKey })
      : null;

  function whenReadyCopy() {
    if (method === 'phone') return strings.result.whenReady.phone;
    if (method === 'email') return strings.result.whenReady.email;
    return fill(strings.result.whenReady.message, {
      method: strings.contact.methods[method],
    });
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={cardRef}
        className="mx-auto max-w-[520px] overflow-hidden rounded-card border border-night/6 bg-stone text-[15px] leading-[1.55] text-night shadow-[0_1px_2px_rgba(10,37,64,0.06),0_12px_32px_rgba(10,37,64,0.08)]"
      >
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 max-[480px]:px-4 max-[480px]:pt-3.5 max-[480px]:pb-2.5">
          <div className="grid h-11 w-11 flex-none place-items-end justify-center overflow-hidden rounded-full bg-yellow">
            <Image
              src="/boarding/michael.webp"
              width={821}
              height={931}
              alt=""
              sizes="44px"
              className="block h-auto w-11 translate-y-[2px]"
            />
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block text-sm font-bold">{strings.who}</strong>
          </div>
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex items-center gap-1 rounded-control px-2 py-1.5 text-[13px] font-semibold text-night/70 hover:bg-parchment hover:text-night"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                aria-hidden="true"
              >
                <path d="M15 6l-6 6 6 6" />
              </svg>
              {strings.back}
            </button>
          ) : null}
        </div>
        <div className="mx-5 h-[3px] overflow-hidden rounded-[3px] bg-iris-soft max-[480px]:mx-4" aria-hidden="true">
          <div
            className="h-full rounded-[3px] bg-blue transition-[width] duration-[400ms] ease-parity motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
        {/* Not a live region: each screen's heading takes focus instead, so a
            screen reader announces the new step once rather than all of it. */}
        <div className="relative min-h-[470px] px-5 pt-[22px] pb-5 max-[480px]:min-h-[440px] max-[480px]:px-4 max-[480px]:pt-[18px] max-[480px]:pb-4">
          {loading ? (
            <div className="grid min-h-[430px] place-content-center justify-items-center">
              <BauhausLoader
                mode="inline"
                size={140}
                eyebrow={strings.loader.eyebrow}
                statuses={
                  loaderKind === 'sending' ? strings.loader.sending : strings.loader.building
                }
                intervalMs={700}
              />
            </div>
          ) : (
            <motion.div
              key={screen}
              initial={enterReady ? { opacity: 0, x: dir === 'back' ? -14 : 14 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              className="grid content-start gap-4"
            >
              {screen === 'start' ? (
                <>
                  <p className="m-0 text-[12.5px] font-semibold text-night/70">
                    {fill(strings.step, { n: 1 })}
                  </p>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.start.title}
                  </h3>
                  <div className="grid gap-2.5">
                    {starts.map((opt) => (
                      <OptionButton
                        key={opt.value}
                        selected={startValue === opt.value}
                        onClick={() => pickStart(opt.value)}
                        label={
                          opt.key === 'asap'
                            ? strings.start.asap
                            : opt.key === 'unsure'
                              ? strings.start.unsure
                              : fill(strings.start[opt.key], { year: opt.year })
                        }
                        note={opt.key === 'asap' ? strings.start.asapNote : undefined}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {screen === 'age' ? (
                <>
                  <p className="m-0 text-[12.5px] font-semibold text-night/70">
                    {fill(strings.step, { n: 2 })}
                  </p>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.age.title}
                  </h3>
                  <p className="-mt-1.5 m-0 text-[14.5px] text-night/70">{strings.age.sub}</p>
                  <div className="grid grid-cols-3 gap-2.5">
                    {AGE_VALUES.map((age) => (
                      <OptionButton
                        key={age}
                        compact
                        selected={ageNow === age}
                        onClick={() => pickAge(age)}
                        label={ageLabel(age, strings)}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {screen === 'mode' ? (
                <>
                  <p className="m-0 text-[12.5px] font-semibold text-night/70">
                    {fill(strings.step, { n: 3 })}
                  </p>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.mode.title}
                  </h3>
                  <p className="-mt-1.5 m-0 text-[14.5px] text-night/70">{strings.mode.sub}</p>
                  <div className="grid gap-2.5">
                    {MODES.map((key) => (
                      <OptionButton
                        key={key}
                        selected={mode === key}
                        onClick={() => pickMode(key)}
                        label={strings.mode[key]}
                        note={
                          key === 'boarding'
                            ? strings.mode.boardingNote
                            : key === 'day'
                              ? strings.mode.dayNote
                              : undefined
                        }
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {screen === 'choice' ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-pill bg-iris-soft px-2.5 py-1 text-[12.5px] font-semibold text-night">
                      {startChipText(startValue, nowKey, strings)}
                    </span>
                    <span className="rounded-pill bg-iris-soft px-2.5 py-1 text-[12.5px] font-semibold text-night">
                      {fill(strings.chips.age, { age: ageLabel(ageNow, strings) })}
                    </span>
                    <span className="rounded-pill bg-iris-soft px-2.5 py-1 text-[12.5px] font-semibold text-night">
                      {strings.chips[mode]}
                    </span>
                    <button
                      type="button"
                      onClick={() => go('start', 'back')}
                      className="px-1 py-1 text-[12.5px] font-semibold text-blue underline underline-offset-2"
                    >
                      {strings.chips.edit}
                    </button>
                  </div>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.choice.title}
                  </h3>
                  <p className="-mt-1.5 m-0 text-[14.5px] text-night/70">{strings.choice.body}</p>
                  <div className="grid gap-2.5">
                    <button
                      type="button"
                      onClick={handlePersonalised}
                      className="grid gap-1 rounded-[14px] border-[1.5px] border-blue bg-parchment p-4 text-left text-night transition-[border-color,background-color] duration-150 ease-parity hover:border-blue/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                    >
                      <b className="flex items-center justify-between gap-2.5 text-base font-semibold">
                        {strings.choice.yes}
                        <em className="rounded-pill bg-yellow px-2.5 py-0.5 text-[11.5px] font-bold not-italic whitespace-nowrap text-night">
                          {strings.choice.yesTime}
                        </em>
                      </b>
                      <span className="text-[13.5px] text-night/70">{strings.choice.yesNote}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleResources}
                      className="grid gap-1 rounded-[14px] border-[1.5px] border-night/12 bg-stone p-4 text-left text-night transition-[border-color,background-color] duration-150 ease-parity hover:border-blue/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                    >
                      <b className="text-base font-semibold">{strings.choice.no}</b>
                      <span className="text-[13.5px] text-night/70">{strings.choice.noNote}</span>
                    </button>
                  </div>
                </>
              ) : null}

              {screen === 'about' ? (
                <>
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.about.title}
                  </h3>
                  <p className="-mt-1.5 m-0 text-[14.5px] text-night/70">{strings.about.sub}</p>
                  {askedNames ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-pill bg-iris-soft px-2.5 py-1 text-[12.5px] font-semibold text-night">
                        {fill(strings.about.asked, { schools: askedNames })}
                      </span>
                    </div>
                  ) : null}
                  <div className="grid gap-1.5">
                    <label htmlFor={`${uid}-about`} className="text-[13.5px] font-semibold">
                      {strings.about.label}{' '}
                      <span className="font-medium text-night/70">{strings.about.optional}</span>
                    </label>
                    <textarea
                      id={`${uid}-about`}
                      value={about}
                      maxLength={LEAD_LIMITS.about}
                      placeholder={strings.about.placeholder}
                      onChange={(event) => setAbout(event.target.value)}
                      className={`${INPUT} min-h-[150px] resize-y leading-normal`}
                    />
                  </div>
                  <div className="mt-1">
                    <button
                      type="button"
                      onClick={() => go('contact')}
                      className={`${BTN_PRIMARY} w-full`}
                    >
                      {strings.about.next}
                      <Arrow />
                    </button>
                  </div>
                </>
              ) : null}

              {screen === 'contact' ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleSend();
                  }}
                  className="grid content-start gap-4"
                >
                  <h3
                    ref={headingRef}
                    tabIndex={-1}
                    className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                  >
                    {strings.contact.title}
                  </h3>
                  <p className="-mt-1.5 m-0 text-[14.5px] text-night/70">
                    {strings.contact.turnaround}
                  </p>
                  <div className="grid gap-1.5">
                    <label htmlFor={`${uid}-name`} className="text-[13.5px] font-semibold">
                      {strings.contact.name}
                    </label>
                    <input
                      ref={nameRef}
                      id={`${uid}-name`}
                      value={firstName}
                      maxLength={LEAD_LIMITS.firstName}
                      autoComplete="given-name"
                      aria-invalid={nameError ? true : undefined}
                      aria-describedby={nameError ? nameErrId : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFirstName(value);
                        if (nameError && value.trim()) setNameError('');
                      }}
                      className={INPUT}
                    />
                    {nameError ? (
                      <p id={nameErrId} className="m-0 text-[13px] text-magenta-ink">
                        {nameError}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid gap-1.5">
                    <span id={`${uid}-method`} className="text-[13.5px] font-semibold">
                      {strings.contact.method}
                    </span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={`${uid}-method`}>
                      {CONTACT_METHODS.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          aria-pressed={method === item.key}
                          onClick={() => pickMethod(item.key)}
                          className={METHOD}
                        >
                          {strings.contact.methods[item.key]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor={`${uid}-contact`} className="text-[13.5px] font-semibold">
                      {field.label}
                    </label>
                    <input
                      ref={contactRef}
                      id={`${uid}-contact`}
                      type={inputMeta.type}
                      autoComplete={inputMeta.autoComplete}
                      placeholder={field.placeholder}
                      value={contactValue}
                      maxLength={LEAD_LIMITS.contact}
                      aria-invalid={contactError ? true : undefined}
                      aria-describedby={contactError ? contactErrId : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setContactValue(value);
                        if (contactError && isValidContact(method, value)) setContactError('');
                      }}
                      className={INPUT}
                    />
                    {contactError ? (
                      <p id={contactErrId} className="m-0 text-[13px] text-magenta-ink">
                        {contactError}
                      </p>
                    ) : field.help ? (
                      <p className="m-0 text-[12.5px] text-night/70">{field.help}</p>
                    ) : null}
                  </div>
                  {/* Honeypot, sent as `company`. The field itself has a
                      name no browser autofills (a real "company" field can be
                      filled by Chrome for a real parent, who would then be
                      dropped as a bot), and no visible label. */}
                  <div
                    className="absolute -left-[9999px] h-px w-px overflow-hidden"
                    aria-hidden="true"
                  >
                    <input
                      id={`${uid}-hp`}
                      name="sx-lead-hp"
                      tabIndex={-1}
                      autoComplete="off"
                      value={company}
                      onChange={(event) => setCompany(event.target.value)}
                    />
                  </div>
                  {sendError ? (
                    <p role="alert" className="m-0 text-[13px] text-magenta-ink">
                      {sendError}
                    </p>
                  ) : null}
                  <div className="mt-1">
                    <button type="submit" className={`${BTN_PRIMARY} w-full`}>
                      {strings.contact.send}
                      <Arrow />
                    </button>
                  </div>
                  <p className="m-0 text-xs text-night/70">{strings.contact.privacy}</p>
                </form>
              ) : null}

              {screen === 'result' && pathResult ? (
                <>
                  {submitted ? (
                    <div
                      role="status"
                      className="grid grid-cols-[24px_minmax(0,1fr)] items-start gap-2.5 rounded-xl bg-jade/10 px-3.5 py-3 text-sm text-night"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        aria-hidden="true"
                        className="h-[22px] w-[22px] text-jade"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M7.5 12.5l3 3 6-6.5" />
                      </svg>
                      <div>
                        <b className="font-bold">
                          {fill(strings.result.thanks, { name: firstName.trim() })}
                        </b>{' '}
                        {whenReadyCopy()}
                      </div>
                    </div>
                  ) : null}
                  <p className="-mb-2 m-0 text-[13px] font-bold tracking-[0.02em] text-blue">
                    {strings.result.label}
                  </p>
                  {pathResult.blocked ? (
                    <>
                      <h3
                        ref={headingRef}
                        tabIndex={-1}
                        className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                      >
                        {strings.result.blockedTitle}
                      </h3>
                      <div className="rounded-xl bg-parchment px-3.5 py-3 text-sm">
                        {ageNow <= 17
                          ? fill(strings.result.blockedLater, {
                              start: startChipText(startValue, nowKey, strings),
                            })
                          : strings.result.blockedOlder}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3
                        ref={headingRef}
                        tabIndex={-1}
                        className="m-0 font-display text-[1.6rem] leading-[1.15] font-normal text-balance focus:outline-none max-[480px]:text-[1.4rem]"
                      >
                        {fill(strings.result.title, {
                          programme: pathResult.entry.programme,
                          year: pathResult.examYear,
                        })}
                      </h3>
                      <p className="-mt-1 m-0 text-sm text-night/70">
                        {fill(strings.result.summary, {
                          years: strings.result.years[pathResult.entry.years],
                          mode: strings.chips[mode],
                          year: pathResult.examYear,
                        })}
                      </p>
                      {pathResult.shifted ? (
                        <div className="rounded-xl bg-parchment px-3.5 py-3 text-sm">
                          {fill(strings.result.shifted, { year: pathResult.schoolYear })}
                        </div>
                      ) : null}
                      <Timeline
                        path={pathResult}
                        startValue={startValue}
                        strings={strings}
                      />
                    </>
                  )}
                  <FeeMap
                    strings={strings}
                    years={pathResult.blocked ? 0 : pathResult.entry.years}
                    mode={mode}
                    selected={selected}
                    onSelect={handleSelect}
                    interest={interest}
                    submitted={submitted}
                    onAsk={handleAsk}
                  />
                  <div className="grid gap-2">
                    <CalButton className={`${BTN_PRIMARY} w-full`}>
                      {strings.cta}
                      <Arrow />
                    </CalButton>
                    <p className="m-0 text-center text-[13.5px] text-night/70">{summaryPdf}</p>
                  </div>
                  {!submitted ? (
                    <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-night/6 pt-3.5 text-sm">
                      <span>{strings.result.upsell}</span>
                      <button
                        type="button"
                        onClick={handlePersonalised}
                        className="bg-transparent p-0 py-1 font-semibold text-blue"
                      >
                        {strings.result.upsellCta} →
                      </button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </motion.div>
          )}
        </div>
        <div className="flex items-center justify-center border-t border-night/6 px-5 pt-3.5 pb-4">
          <Image
            src="/logo-studentx-geometric.png"
            width={11200}
            height={1600}
            alt="StudentX"
            sizes="120px"
            className="block h-[17px] w-auto"
          />
        </div>
      </div>
    </MotionConfig>
  );
}
