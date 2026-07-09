'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';

const INK = '#0a2540';
const ACCENT = '#635BFF';
const COLUMN = 560;

const SUCCESS = {
  text: '#0d7038',
  bg: 'rgba(22,163,74,0.12)',
  border: 'rgba(22,163,74,0.32)',
  solid: '#16a34a',
};
const DANGER = {
  text: '#b42318',
  bg: 'rgba(220,38,38,0.10)',
  border: 'rgba(220,38,38,0.30)',
  solid: '#dc2626',
};

function BackButton({ href, onClick }) {
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
      <span style={{ fontSize: 16, lineHeight: 1 }}>←</span> Resources
    </>
  );
  if (href) return <Link href={href} style={style}>{inner}</Link>;
  return <button type="button" onClick={onClick} style={style}>{inner}</button>;
}

function ProgressBar({ current, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 999,
          background: 'rgba(10,37,64,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(current / total) * 100}%`,
            background: ACCENT,
            borderRadius: 999,
            transition: 'width 240ms ease',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'rgba(10,37,64,0.45)',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.02em',
        }}
      >
        {current} / {total}
      </span>
    </div>
  );
}

function NextButton({ onClick, label = 'Next →' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 20,
        display: 'block',
        width: '100%',
        padding: '14px 0',
        borderRadius: 14,
        border: 'none',
        background: ACCENT,
        color: '#fff',
        fontSize: 15.5,
        fontWeight: 600,
        cursor: 'pointer',
        letterSpacing: '-0.01em',
      }}
    >
      {label}
    </button>
  );
}

// MCQ question: letter-keyed options object + answer letter
function McqCard({ question, onNext, isLast }) {
  const [chosen, setChosen] = useState(null); // chosen letter or null

  const letters = Object.keys(question.options); // ['A','B','C','D']
  const locked = chosen !== null;

  return (
    <div>
      {question.source && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 24,
            padding: '0 11px',
            borderRadius: 999,
            background: 'rgba(99,91,255,0.10)',
            color: ACCENT,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          {question.source}
        </span>
      )}

      <h2
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: INK,
          margin: '0 0 22px',
        }}
      >
        {question.stem}
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {letters.map((letter) => {
          const isCorrect = locked && letter === question.answer;
          const isChosenWrong = locked && letter === chosen && letter !== question.answer;

          let border = 'rgba(10,37,64,0.14)';
          let background = '#ffffff';
          let badgeBg = 'rgba(10,37,64,0.06)';
          let badgeColor = INK;
          let opacity = 1;

          if (isCorrect) {
            border = SUCCESS.border;
            background = SUCCESS.bg;
            badgeBg = SUCCESS.solid;
            badgeColor = '#ffffff';
          } else if (isChosenWrong) {
            border = DANGER.border;
            background = DANGER.bg;
            badgeBg = DANGER.solid;
            badgeColor = '#ffffff';
          } else if (locked) {
            opacity = 0.6;
          }

          return (
            <button
              key={letter}
              type="button"
              disabled={locked}
              onClick={() => !locked && setChosen(letter)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                borderRadius: 14,
                border: `1.5px solid ${border}`,
                background,
                color: INK,
                opacity,
                cursor: locked ? 'default' : 'pointer',
                transition: 'border-color 160ms ease, background 160ms ease',
                fontSize: 15.5,
                lineHeight: 1.4,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: badgeBg,
                  color: badgeColor,
                  fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                  fontSize: 13.5,
                  fontWeight: 700,
                  transition: 'background 160ms ease, color 160ms ease',
                }}
              >
                {letter}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                {question.options[letter]}
              </span>
              {isCorrect && (
                <span
                  style={{
                    marginLeft: 'auto',
                    flexShrink: 0,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: SUCCESS.bg,
                    color: SUCCESS.text,
                    border: `1px solid ${SUCCESS.border}`,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Correct
                </span>
              )}
              {isChosenWrong && (
                <span
                  style={{
                    marginLeft: 'auto',
                    flexShrink: 0,
                    padding: '3px 9px',
                    borderRadius: 999,
                    background: DANGER.bg,
                    color: DANGER.text,
                    border: `1px solid ${DANGER.border}`,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Your answer
                </span>
              )}
            </button>
          );
        })}
      </div>

      {locked && question.explanation && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 18,
            border: '1px solid rgba(10,37,64,0.08)',
            background: '#f6f4ff',
            padding: '16px 18px',
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(10,37,64,0.45)',
            }}
          >
            Explanation
          </p>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: INK }}>{question.explanation}</p>
        </div>
      )}

      {locked && (
        <NextButton
          onClick={() => onNext(question.id, chosen === question.answer)}
          label={isLast ? 'See results' : 'Next →'}
        />
      )}
    </div>
  );
}

// Long-answer question: stem + collapsible mark scheme
function LongAnswerCard({ question, onNext, isLast }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      {question.source && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 24,
            padding: '0 11px',
            borderRadius: 999,
            background: 'rgba(10,37,64,0.06)',
            color: 'rgba(10,37,64,0.50)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          {question.source}
        </span>
      )}

      <h2
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: INK,
          margin: '0 0 22px',
        }}
      >
        {question.stem}
      </h2>

      {!revealed ? (
        <button
          type="button"
          onClick={() => setRevealed(true)}
          style={{
            display: 'block',
            width: '100%',
            padding: '14px 0',
            borderRadius: 14,
            border: `1.5px solid rgba(10,37,64,0.14)`,
            background: '#ffffff',
            color: INK,
            fontSize: 15.5,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          Show mark scheme
        </button>
      ) : (
        <div
          style={{
            borderRadius: 18,
            border: '1px solid rgba(10,37,64,0.08)',
            background: '#f6f4ff',
            padding: '16px 18px',
          }}
        >
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(10,37,64,0.45)',
            }}
          >
            Mark scheme
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {question.mark_scheme.map((point, i) => (
              <li
                key={i}
                style={{
                  fontSize: 15,
                  lineHeight: 1.5,
                  color: INK,
                }}
              >
                {point}
              </li>
            ))}
          </ul>
        </div>
      )}

      {revealed && <NextButton onClick={onNext} label={isLast ? 'See results' : 'Next →'} />}
      {!revealed && (
        <p
          style={{
            marginTop: 14,
            fontSize: 13,
            color: 'rgba(10,37,64,0.40)',
            textAlign: 'center',
          }}
        >
          Write your answer, then reveal to compare.
        </p>
      )}
    </div>
  );
}

function ScoreScreen({ score, mcqTotal, total, onRestart }) {
  const pct = mcqTotal > 0 ? Math.round((score / mcqTotal) * 100) : 0;
  return (
    <div style={{ textAlign: 'center', paddingTop: 32 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'rgba(99,91,255,0.10)',
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
            fontSize: 28,
            fontWeight: 700,
            color: ACCENT,
            letterSpacing: '-0.02em',
          }}
        >
          {pct}%
        </span>
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 26,
          color: INK,
          letterSpacing: '-0.02em',
          margin: '0 0 8px',
        }}
      >
        {score} / {mcqTotal} MCQ correct
      </h2>
      <p style={{ fontSize: 14, color: 'rgba(10,37,64,0.50)', margin: '0 0 32px' }}>
        {total - mcqTotal} long-answer questions reviewed
      </p>

      <button
        type="button"
        onClick={onRestart}
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: 'none',
          background: ACCENT,
          color: '#fff',
          fontSize: 15.5,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        Restart test
      </button>

      <Link
        href="/resources"
        style={{
          display: 'block',
          width: '100%',
          padding: '14px 0',
          borderRadius: 14,
          border: '1.5px solid rgba(10,37,64,0.14)',
          background: '#ffffff',
          color: INK,
          fontSize: 15.5,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'none',
          textAlign: 'center',
        }}
      >
        Back to resources
      </Link>
    </div>
  );
}

export default function BiochemTestPlayer({ test }) {
  const [pos, setPos] = useState(0);
  // mcqScores[questionId] = true/false (only for MCQ questions that were answered)
  const [mcqScores, setMcqScores] = useState({});
  const [key, setKey] = useState(0); // bump to reset card state on question change

  const questions = test.questions;
  const done = pos >= questions.length;
  const current = done ? null : questions[pos];

  const mcqQuestions = questions.filter((q) => q.type === 'mcq');
  const mcqTotal = mcqQuestions.length;
  const score = Object.values(mcqScores).filter(Boolean).length;

  function handleNext(questionId, isCorrect) {
    if (questionId && typeof isCorrect === 'boolean') {
      setMcqScores((prev) => ({ ...prev, [questionId]: isCorrect }));
    }
    setPos((p) => p + 1);
    setKey((k) => k + 1);
  }

  function handleRestart() {
    setPos(0);
    setMcqScores({});
    setKey((k) => k + 1);
  }

  return (
    <div>
      <div style={{ maxWidth: COLUMN, margin: '0 auto', padding: '32px 24px 0' }}>
        {done ? (
          <BackButton href="/resources" />
        ) : (
          <BackButton href="/resources" />
        )}
      </div>

      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 24px 64px',
        }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN }}>
          {!done && (
            <ProgressBar current={pos + 1} total={questions.length} />
          )}

          {done ? (
            <ScoreScreen
              score={score}
              mcqTotal={mcqTotal}
              total={questions.length}
              onRestart={handleRestart}
            />
          ) : current.type === 'mcq' ? (
            <McqCard
              key={key}
              question={current}
              onNext={handleNext}
              isLast={pos === questions.length - 1}
            />
          ) : (
            <LongAnswerCard
              key={key}
              question={current}
              onNext={() => handleNext()}
              isLast={pos === questions.length - 1}
            />
          )}
        </div>
      </section>
    </div>
  );
}
