'use client';

import { useState } from 'react';
import { prettifyTopic } from '@/lib/practice/format';
import { PrimaryButton } from './PlayerButton';

// FINISHED state. Shows the overall score, a per-topic breakdown, and a list of
// wrongly answered questions; clicking one opens it in read-only review (handled
// by the parent via onReview). "Retry test" rebuilds a fresh shuffled attempt.

const INK = '#0a2540';
const ACCENT = '#635BFF';
const DANGER = '#dc2626';

function topicBreakdown(questions, answers) {
  const map = new Map();
  questions.forEach((q, i) => {
    const entry = map.get(q.topic) || { topic: q.topic, correct: 0, total: 0 };
    entry.total += 1;
    if (answers[i] === q.correct) entry.correct += 1;
    map.set(q.topic, entry);
  });
  return [...map.values()];
}

function WrongRow({ position, stem, onClick, t }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t('review.label')}: ${stem}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        textAlign: 'left',
        padding: '13px 15px',
        borderRadius: 14,
        border: `1px solid ${hover ? ACCENT : 'rgba(10,37,64,0.12)'}`,
        background: '#ffffff',
        cursor: 'pointer',
        transition: 'border-color 160ms ease',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(220,38,38,0.10)',
          color: DANGER,
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {position}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 14.5,
          lineHeight: 1.4,
          color: INK,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {stem}
      </span>
      <span aria-hidden="true" style={{ flexShrink: 0, color: 'rgba(10,37,64,0.4)' }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}

// Past attempts for this test (the current completion excluded — the parent
// reads them before saving the new attempt), most recent first.
function PreviousAttempts({ attempts, t }) {
  const rows = [...attempts]
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .map((a) => {
      const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
      const when = a.finishedAt ? new Date(a.finishedAt) : null;
      const date =
        when && !Number.isNaN(when.getTime())
          ? when.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
          : '';
      return { key: a.finishedAt, date, score: a.score, total: a.total, pct };
    });

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={sectionHeading}>{t('results.previousAttempts')}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '11px 15px',
              borderRadius: 12,
              border: '1px solid rgba(10,37,64,0.08)',
              background: '#ffffff',
            }}
          >
            <span style={{ fontSize: 14, color: 'rgba(10,37,64,0.6)' }}>{row.date}</span>
            <span
              style={{
                fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                fontSize: 14.5,
                fontWeight: 600,
                color: INK,
              }}
            >
              {t('results.previousAttemptScore', {
                score: row.score,
                total: row.total,
                percent: row.pct,
              })}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ScoreSummary({ attempt, answers, t, onReview, onRetry, previousAttempts = [] }) {
  const questions = attempt.questions;
  const total = questions.length;
  const score = questions.reduce((acc, q, i) => acc + (answers[i] === q.correct ? 1 : 0), 0);
  const percent = total === 0 ? 0 : Math.round((score / total) * 100);

  const topics = topicBreakdown(questions, answers);
  const wrong = questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => answers[i] !== q.correct);

  return (
    <div>
      <h1
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          color: INK,
          margin: '0 0 20px',
        }}
      >
        {t('results.title')}
      </h1>

      {/* Score card */}
      <div
        style={{
          borderRadius: 22,
          border: '1px solid rgba(99,91,255,0.25)',
          background: '#f6f4ff',
          padding: '26px 24px',
          display: 'flex',
          alignItems: 'baseline',
          gap: 14,
          boxShadow: '0 10px 28px -16px rgba(10,37,64,0.16)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
            fontWeight: 700,
            fontSize: 40,
            letterSpacing: '-0.02em',
            color: ACCENT,
          }}
        >
          {t('results.scoreValue', { score, total })}
        </span>
        <span style={{ fontSize: 18, fontWeight: 600, color: 'rgba(10,37,64,0.55)' }}>
          {t('results.percent', { percent })}
        </span>
      </div>

      {/* Per-topic breakdown */}
      <section style={{ marginTop: 28 }}>
        <h2 style={sectionHeading}>{t('results.byTopic')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topics.map((row) => (
            <div
              key={row.topic}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '11px 15px',
                borderRadius: 12,
                border: '1px solid rgba(10,37,64,0.08)',
                background: '#ffffff',
              }}
            >
              <span style={{ fontSize: 14.5, color: INK }}>{prettifyTopic(row.topic)}</span>
              <span
                style={{
                  fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                  fontSize: 14.5,
                  fontWeight: 600,
                  color: row.correct === row.total ? '#0f7a3d' : 'rgba(10,37,64,0.6)',
                }}
              >
                {t('results.topicScore', { correct: row.correct, total: row.total })}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Wrong-answer review list */}
      <section style={{ marginTop: 28 }}>
        <h2 style={sectionHeading}>{t('results.reviewMistakes')}</h2>
        {wrong.length === 0 ? (
          <p style={{ margin: 0, fontSize: 14.5, color: 'rgba(10,37,64,0.6)' }}>
            {t('results.allCorrect')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {wrong.map(({ q, i }) => (
              <WrongRow
                key={q.id}
                position={i + 1}
                stem={q.stem}
                onClick={() => onReview(i)}
                t={t}
              />
            ))}
          </div>
        )}
      </section>

      {previousAttempts.length > 0 && <PreviousAttempts attempts={previousAttempts} t={t} />}

      <div style={{ marginTop: 32 }}>
        <PrimaryButton onClick={onRetry}>{t('results.retry')}</PrimaryButton>
      </div>
    </div>
  );
}

const sectionHeading = {
  fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: '-0.01em',
  color: INK,
  margin: '0 0 12px',
};
