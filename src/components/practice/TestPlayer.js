'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import QuestionCard from './QuestionCard';
import FeedbackPanel from './FeedbackPanel';
import ScoreSummary from './ScoreSummary';
import Lightbox from './Lightbox';
import { PrimaryButton, TextButton } from './PlayerButton';

const ACCENT = '#635BFF';
const COLUMN = 560;

/* ---------- attempt construction (pure, never mutates the loaded JSON) ---------- */

// Fisher-Yates on a *copy* — the source array is untouched.
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Turn a loaded question into the display form the player renders: options
// carry their original index so `correct` can be re-mapped after a shuffle.
function toDisplayQuestion(q, originalIndex, shuffleOptions) {
  const pairs = q.options.map((text, i) => ({ text, originalIndex: i }));
  const displayOptions = shuffleOptions ? shuffle(pairs) : pairs;
  const correct = displayOptions.findIndex((o) => o.originalIndex === q.correct);
  return {
    id: q.id,
    type: q.type,
    stem: q.stem,
    topic: q.topic,
    explanation: q.explanation,
    displayOptions,
    correct,
    originalIndex,
  };
}

// A fresh attempt. The first render shuffles question order only (options stay
// in authored order); Retry passes shuffleOptions=true to also scramble each
// question's options — defeating positional memory on a repeat run.
function buildAttempt(test, shuffleOptions = false) {
  const order = shuffle(test.questions.map((_, i) => i));
  const questions = order.map((origIdx) =>
    toDisplayQuestion(test.questions[origIdx], origIdx, shuffleOptions),
  );
  return { order, questions };
}

/* ---------- layout helpers ---------- */

function BackRow({ href, onClick, label }) {
  const style = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    fontWeight: 600,
    color: 'rgba(10,37,64,0.45)',
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    letterSpacing: '-0.1px',
  };
  const inner = (
    <>
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
        ←
      </span>{' '}
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} style={style}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {inner}
    </button>
  );
}

function Shell({ back, children }) {
  return (
    <div>
      <div style={{ maxWidth: COLUMN, margin: '0 auto', padding: '32px 24px 0' }}>{back}</div>
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 24px 64px',
        }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN }}>{children}</div>
      </section>
    </div>
  );
}

function PlayerSkeleton() {
  const bar = (width, height) => (
    <div style={{ width, height, borderRadius: 8, background: 'rgba(10,37,64,0.06)' }} />
  );
  return (
    <div aria-hidden="true">
      <div style={{ maxWidth: COLUMN, margin: '0 auto', padding: '32px 24px 0' }}>{bar(90, 14)}</div>
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 24px 64px',
        }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bar('40%', 14)}
          {bar('90%', 26)}
          {bar('100%', 54)}
          {bar('100%', 54)}
          {bar('100%', 54)}
          {bar('100%', 54)}
        </div>
      </section>
    </div>
  );
}

/* ---------- player ---------- */

// `onReportIssue` is the stable hook P5 will pass to wire up the ReportIssueModal.
// In P3 it is left undefined, so the "Report an issue" button renders but is inert.
export default function TestPlayer(props) {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <TestPlayerInner {...props} />
    </Suspense>
  );
}

function TestPlayerInner({ test, subject, onReportIssue }) {
  const t = useTranslations('student.practice.player');
  const searchParams = useSearchParams();
  const reviewId = searchParams.get('review');

  const listHref = `/student/ausom/semester-2/${subject}`;

  // Shared lightbox across every mode.
  const [lightbox, setLightbox] = useState(null); // { src, alt } | null
  const openLightbox = useCallback((src, alt) => setLightbox({ src, alt }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // Live attempt state.
  const [attempt, setAttempt] = useState(() => buildAttempt(test));
  const [answers, setAnswers] = useState(() => test.questions.map(() => null));
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(null);

  // The attempt is built with Math.random (shuffle), so it MUST NOT render
  // during SSR — server and client would disagree and React would throw a
  // hydration mismatch. Gate the randomized UI behind a client-only mount flag;
  // the server (and the first client paint) render the deterministic skeleton.
  // The set-on-mount is the whole point here (flip to client rendering), so the
  // set-state-in-effect rule is intentionally disabled for this one line.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Admin deep-link: ?review=<questionId> → read-only review of that question.
  const deepLinkIndex = reviewId ? test.questions.findIndex((q) => q.id === reviewId) : -1;
  const deepLinkQuestion = deepLinkIndex >= 0 ? test.questions[deepLinkIndex] : null;

  const total = attempt.questions.length;
  const aq = attempt.questions[current];
  const answered = answers[current] != null;
  const isLast = current === total - 1;
  const answeredCount = answers.filter((a) => a != null).length;

  const handleSelect = useCallback(
    (displayIdx) => {
      setAnswers((prev) => {
        if (prev[current] != null) return prev; // locked after first pick
        if (displayIdx < 0 || displayIdx >= attempt.questions[current].displayOptions.length) {
          return prev;
        }
        const next = prev.slice();
        next[current] = displayIdx;
        return next;
      });
    },
    [current, attempt],
  );

  const handleAdvance = useCallback(() => {
    if (current < total - 1) setCurrent(current + 1);
    else setFinished(true);
  }, [current, total]);

  const handleRetry = useCallback(() => {
    setAttempt(buildAttempt(test, true));
    setAnswers(test.questions.map(() => null));
    setCurrent(0);
    setFinished(false);
    setReviewIndex(null);
  }, [test]);

  // Keyboard: 1–5 selects an option while ANSWERING; Enter advances once
  // ANSWERED. Disabled in finished / review / lightbox-open states.
  useEffect(() => {
    if (!mounted || finished || deepLinkQuestion || lightbox) return undefined;
    function onKey(e) {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) {
        return;
      }
      if (answers[current] == null) {
        if (e.key >= '1' && e.key <= '5') {
          const idx = Number(e.key) - 1;
          if (idx < attempt.questions[current].displayOptions.length) {
            e.preventDefault();
            handleSelect(idx);
          }
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAdvance();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mounted, finished, deepLinkQuestion, lightbox, answers, current, attempt, handleSelect, handleAdvance]);

  const lightboxEl = lightbox ? (
    <Lightbox
      src={lightbox.src}
      alt={lightbox.alt}
      label={t('lightboxLabel')}
      closeLabel={t('closeLightbox')}
      onClose={closeLightbox}
    />
  ) : null;

  // Until mounted on the client, render the deterministic skeleton (see the
  // mount-flag note above) so SSR and hydration agree.
  if (!mounted) return <PlayerSkeleton />;

  // 1) Admin deep-link review (read-only, no chosen answer).
  if (deepLinkQuestion) {
    const dq = toDisplayQuestion(deepLinkQuestion, deepLinkIndex, false);
    return (
      <>
        <Shell back={<BackRow href={listHref} label={t('review.backToTests')} />}>
          <QuestionCard question={dq} chosen={null} locked t={t} />
          <FeedbackPanel explanation={dq.explanation} result={null} onZoom={openLightbox} t={t} />
        </Shell>
        {lightboxEl}
      </>
    );
  }

  // 2) Reviewing a wrong answer from the score summary (read-only).
  if (finished && reviewIndex != null) {
    const rq = attempt.questions[reviewIndex];
    const result = answers[reviewIndex] === rq.correct ? 'correct' : 'incorrect';
    return (
      <>
        <Shell back={<BackRow onClick={() => setReviewIndex(null)} label={t('review.backToResults')} />}>
          <QuestionCard question={rq} chosen={answers[reviewIndex]} locked t={t} />
          <FeedbackPanel explanation={rq.explanation} result={result} onZoom={openLightbox} t={t} />
        </Shell>
        {lightboxEl}
      </>
    );
  }

  // 3) FINISHED — score summary.
  if (finished) {
    return (
      <>
        <Shell back={<BackRow href={listHref} label={t('review.backToTests')} />}>
          <ScoreSummary
            attempt={attempt}
            answers={answers}
            t={t}
            onReview={setReviewIndex}
            onRetry={handleRetry}
          />
        </Shell>
        {lightboxEl}
      </>
    );
  }

  // 4) ANSWERING / ANSWERED.
  return (
    <>
      <Shell back={<BackRow href={listHref} label={t('review.backToTests')} />}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 10 }}>
            <span
              style={{
                fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: '-0.01em',
                color: 'rgba(10,37,64,0.55)',
              }}
            >
              {t('progress', { current: current + 1, total })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t('progressBarLabel')}
            aria-valuenow={answeredCount}
            aria-valuemin={0}
            aria-valuemax={total}
            style={{
              height: 6,
              borderRadius: 999,
              background: 'rgba(10,37,64,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(answeredCount / total) * 100}%`,
                background: ACCENT,
                borderRadius: 999,
                transition: 'width 280ms cubic-bezier(.2,.7,.2,1)',
              }}
            />
          </div>
        </div>

        <QuestionCard
          question={aq}
          chosen={answers[current]}
          locked={answered}
          onSelect={handleSelect}
          t={t}
        />

        {answered && (
          <FeedbackPanel
            explanation={aq.explanation}
            result={answers[current] === aq.correct ? 'correct' : 'incorrect'}
            onZoom={openLightbox}
            t={t}
          />
        )}

        <div
          style={{
            marginTop: 26,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <TextButton
            onClick={() =>
              onReportIssue?.({ subject, testId: test.id, questionId: aq.id, version: test.version })
            }
          >
            {t('reportIssue')}
          </TextButton>
          {answered && (
            <PrimaryButton onClick={handleAdvance}>
              {isLast ? t('seeResults') : t('next')}
            </PrimaryButton>
          )}
        </div>
      </Shell>
      {lightboxEl}
    </>
  );
}
