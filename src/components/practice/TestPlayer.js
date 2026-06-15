'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { getProgressStore } from '@/lib/practice/progress';
import QuestionCard from './QuestionCard';
import FeedbackPanel from './FeedbackPanel';
import ScoreSummary from './ScoreSummary';
import Lightbox from './Lightbox';
import ReportIssueModal from './ReportIssueModal';
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
    image: q.image,
    imageAlt: q.imageAlt,
    imageCaption: q.imageCaption,
    topic: q.topic,
    explanation: q.explanation,
    displayOptions,
    correct,
    originalIndex,
  };
}

// Build an attempt from an explicit question order (array of original indices).
function buildAttemptFromOrder(test, order, shuffleOptions) {
  const questions = order.map((origIdx) =>
    toDisplayQuestion(test.questions[origIdx], origIdx, shuffleOptions),
  );
  return { order, questions };
}

// A fresh attempt. The first render shuffles question order only (options stay
// in authored order); Retry passes shuffleOptions=true to also scramble each
// question's options — defeating positional memory on a repeat run.
function buildAttempt(test, shuffleOptions = false) {
  return buildAttemptFromOrder(test, shuffle(test.questions.map((_, i) => i)), shuffleOptions);
}

/* ---------- progress persistence mapping (internal state ⇄ store records) ----------

   Internal `answers` is positional: answers[pos] = display-option index | null.
   Persisted records use AUTHORED option indices so they survive option shuffles
   and mean something to a future Supabase store. These helpers translate both
   ways. */

// Mid-test snapshot: the shuffled question-id order plus the answers given so far.
function toSnapshot(test, subject, attempt, answers) {
  const order = attempt.questions.map((q) => q.id);
  const answered = [];
  attempt.questions.forEach((q, pos) => {
    const displayIdx = answers[pos];
    if (displayIdx == null) return;
    answered.push({
      questionId: q.id,
      chosen: q.displayOptions[displayIdx].originalIndex,
      correct: q.displayOptions[q.correct].originalIndex,
    });
  });
  return { testId: test.id, subject, version: test.version, order, answers: answered };
}

// Rebuild the exact attempt + positional answers from a saved snapshot.
function fromSnapshot(test, snapshot) {
  const idToIndex = new Map(test.questions.map((q, i) => [q.id, i]));
  const order = (snapshot.order || [])
    .map((id) => idToIndex.get(id))
    .filter((i) => typeof i === 'number');

  // If the saved order doesn't cover the test 1:1 (content drift / corruption),
  // fall back to a fresh shuffle rather than rendering a broken attempt.
  const attempt =
    order.length === test.questions.length
      ? buildAttemptFromOrder(test, order, false)
      : buildAttempt(test);

  const answers = test.questions.map(() => null);
  const byQuestion = new Map((snapshot.answers || []).map((a) => [a.questionId, a]));
  attempt.questions.forEach((q, pos) => {
    const saved = byQuestion.get(q.id);
    if (!saved) return;
    const displayIdx = q.displayOptions.findIndex((o) => o.originalIndex === saved.chosen);
    if (displayIdx >= 0) answers[pos] = displayIdx;
  });
  return { attempt, answers };
}

// Completed attempt record for saveAttempt().
function toAttempt(test, subject, attempt, answers, startedAt) {
  let score = 0;
  const list = attempt.questions.map((q, pos) => {
    const displayIdx = answers[pos];
    const chosen = displayIdx == null ? null : q.displayOptions[displayIdx].originalIndex;
    if (displayIdx != null && displayIdx === q.correct) score += 1;
    return { questionId: q.id, chosen, correct: q.displayOptions[q.correct].originalIndex };
  });
  return {
    testId: test.id,
    subject,
    version: test.version,
    startedAt,
    finishedAt: new Date().toISOString(),
    score,
    total: attempt.questions.length,
    answers: list,
  };
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

// Shown on mount when a saved in-progress snapshot exists for this test+version.
function ResumeBanner({ current, total, onContinue, onStartOver, t }) {
  return (
    <div
      style={{
        borderRadius: 22,
        border: '1px solid rgba(99,91,255,0.25)',
        background: '#f6f4ff',
        padding: '24px 24px 22px',
        boxShadow: '0 10px 28px -16px rgba(10,37,64,0.16)',
      }}
    >
      <h2
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 20,
          letterSpacing: '-0.01em',
          color: '#0a2540',
          margin: '0 0 6px',
        }}
      >
        {t('resume.title')}
      </h2>
      <p style={{ margin: '0 0 18px', fontSize: 14.5, lineHeight: 1.5, color: 'rgba(10,37,64,0.6)' }}>
        {t('resume.description', { current, total })}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <PrimaryButton onClick={onContinue}>{t('resume.continue')}</PrimaryButton>
        <TextButton onClick={onStartOver}>{t('resume.startOver')}</TextButton>
      </div>
    </div>
  );
}

/* ---------- player ---------- */

// `onReportIssue` is the stable hook from P3. P5 wires it to the ReportIssueModal:
// when no explicit handler is passed (the normal case), the player owns its own
// modal state and the "Report an issue" button opens it. A parent may still
// override by passing `onReportIssue` (e.g. for testing).
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

  // Report-issue modal. The P3 hook passes { subject, testId, questionId, version };
  // store it as the modal's context (mapping version → testVersion). A parent-
  // supplied `onReportIssue` wins; otherwise we open our own modal.
  const [reportCtx, setReportCtx] = useState(null);
  const handleReportIssue = useCallback(
    (ctx) => {
      if (onReportIssue) {
        onReportIssue(ctx);
        return;
      }
      setReportCtx({
        subject: ctx.subject,
        testId: ctx.testId,
        questionId: ctx.questionId,
        testVersion: ctx.version,
      });
    },
    [onReportIssue],
  );
  const closeReport = useCallback(() => setReportCtx(null), []);

  // Live attempt state.
  const [attempt, setAttempt] = useState(() => buildAttempt(test));
  const [answers, setAnswers] = useState(() => test.questions.map(() => null));
  const [current, setCurrent] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(null);

  // Progress persistence. `resume` holds a saved snapshot awaiting a
  // Continue/Start-over decision; `previousAttempts` are the prior completions
  // shown in the score summary (captured before the current one is saved).
  const [resume, setResume] = useState(null);
  const [previousAttempts, setPreviousAttempts] = useState([]);
  const startedAtRef = useRef(null);
  const savedRef = useRef(false); // guards saveAttempt against duplicate finishes

  // The attempt is built with Math.random (shuffle), so it MUST NOT render
  // during SSR — server and client would disagree and React would throw a
  // hydration mismatch. Gate the randomized UI behind a client-only mount flag;
  // the server (and the first client paint) render the deterministic skeleton.
  // The set-on-mount is the whole point here (flip to client rendering), so the
  // set-state-in-effect rule is intentionally disabled for this one line.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    startedAtRef.current = new Date().toISOString();

    // Offer to resume a saved in-progress snapshot for this exact test version.
    // A version mismatch (content edited since) is silently discarded so the
    // user always starts fresh against the current questions.
    const store = getProgressStore();
    const snapshot = store.getInProgress(subject, test.id);
    if (snapshot && snapshot.version === test.version && snapshot.answers.length > 0) {
      setResume(snapshot);
    } else if (snapshot) {
      store.clearInProgress(subject, test.id);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // Mount-only: `test`/`subject` are stable for a given page render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist a snapshot after every answer so a refresh can resume in place.
  // Skipped while the resume offer is pending and once the test is finished.
  useEffect(() => {
    if (!mounted || finished || resume) return;
    if (answers.every((a) => a == null)) return;
    getProgressStore().saveInProgress(toSnapshot(test, subject, attempt, answers));
  }, [mounted, finished, resume, answers, attempt, test, subject]);

  // On finish: capture prior attempts (for the summary), record this attempt,
  // then clear the in-progress snapshot. The savedRef guard makes it idempotent
  // across re-renders / strict-mode double-invokes; it resets on retry.
  useEffect(() => {
    if (!finished || savedRef.current) return;
    savedRef.current = true;
    const store = getProgressStore();
    setPreviousAttempts(store.getAttempts(subject, test.id));
    store.saveAttempt(toAttempt(test, subject, attempt, answers, startedAtRef.current));
    store.clearInProgress(subject, test.id);
  }, [finished, attempt, answers, test, subject]);

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
    startedAtRef.current = new Date().toISOString();
    savedRef.current = false;
  }, [test]);

  // Resume offer → restore the exact saved attempt and jump to the first
  // unanswered question.
  const handleContinue = useCallback(() => {
    const { attempt: restored, answers: restoredAnswers } = fromSnapshot(test, resume);
    const firstUnanswered = restoredAnswers.findIndex((a) => a == null);
    setAttempt(restored);
    setAnswers(restoredAnswers);
    setCurrent(firstUnanswered === -1 ? restoredAnswers.length - 1 : firstUnanswered);
    setFinished(false);
    setReviewIndex(null);
    savedRef.current = false;
    setResume(null);
  }, [test, resume]);

  // Resume offer → discard the snapshot and begin a fresh shuffled attempt.
  const handleStartOver = useCallback(() => {
    getProgressStore().clearInProgress(subject, test.id);
    setAttempt(buildAttempt(test));
    setAnswers(test.questions.map(() => null));
    setCurrent(0);
    setFinished(false);
    setReviewIndex(null);
    startedAtRef.current = new Date().toISOString();
    savedRef.current = false;
    setResume(null);
  }, [test, subject]);

  // Keyboard: 1–5 selects an option while ANSWERING; Enter advances once
  // ANSWERED. Disabled in finished / review / lightbox-open states.
  useEffect(() => {
    if (!mounted || finished || deepLinkQuestion || lightbox || resume || reportCtx) return undefined;
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
  }, [mounted, finished, deepLinkQuestion, lightbox, resume, reportCtx, answers, current, attempt, handleSelect, handleAdvance]);

  const reportEl = reportCtx ? (
    <ReportIssueModal
      subject={reportCtx.subject}
      testId={reportCtx.testId}
      questionId={reportCtx.questionId}
      testVersion={reportCtx.testVersion}
      onClose={closeReport}
    />
  ) : null;

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
          <QuestionCard question={dq} chosen={null} locked onZoom={openLightbox} t={t} />
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
          <QuestionCard question={rq} chosen={answers[reviewIndex]} locked onZoom={openLightbox} t={t} />
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
            previousAttempts={previousAttempts}
          />
        </Shell>
        {lightboxEl}
      </>
    );
  }

  // 3.5) RESUME OFFER — a saved snapshot for this test+version is awaiting a
  // Continue / Start-over decision before the attempt is shown.
  if (resume) {
    const answeredSoFar = resume.answers.length;
    return (
      <>
        <Shell back={<BackRow href={listHref} label={t('review.backToTests')} />}>
          <ResumeBanner
            current={Math.min(answeredSoFar + 1, test.questions.length)}
            total={test.questions.length}
            onContinue={handleContinue}
            onStartOver={handleStartOver}
            t={t}
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
          onZoom={openLightbox}
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
              handleReportIssue({ subject, testId: test.id, questionId: aq.id, version: test.version })
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
      {reportEl}
    </>
  );
}
