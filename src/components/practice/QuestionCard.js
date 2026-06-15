'use client';

import { useState } from 'react';
import { prettifyTopic } from '@/lib/practice/format';

// Stem + options for one question. Reused in three places:
//   - live ANSWERING/ANSWERED states (locked once answered)
//   - the post-test review of a wrong question (locked, chosen set)
//   - the admin ?review deep-link (locked, chosen = null)
//
// When `locked`, options stop accepting clicks and reveal correctness: the
// correct option reads success (green), and a chosen-wrong option reads danger
// (red). Visible "Correct answer" / "Your answer" tags carry the same meaning
// without relying on colour alone.

const INK = '#0a2540';
const ACCENT = '#635BFF';

const SUCCESS = { text: '#0f7a3d', bg: 'rgba(22,163,74,0.10)', border: 'rgba(22,163,74,0.45)', solid: '#16a34a' };
const DANGER = { text: '#b42318', bg: 'rgba(220,38,38,0.08)', border: 'rgba(220,38,38,0.45)', solid: '#dc2626' };

function AnswerTag({ tone, children }) {
  return (
    <span
      style={{
        marginLeft: 'auto',
        flexShrink: 0,
        padding: '3px 9px',
        borderRadius: 999,
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

export default function QuestionCard({ question, chosen, locked, onSelect, onZoom, t }) {
  const [hover, setHover] = useState(-1);

  return (
    <div>
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
        }}
      >
        {prettifyTopic(question.topic)}
      </span>

      <h2
        style={{
          fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
          fontWeight: 600,
          fontSize: 22,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: INK,
          margin: '16px 0 22px',
        }}
      >
        {question.stem}
      </h2>

      {question.image && (
        <figure style={{ margin: '0 0 22px' }}>
          <button
            type="button"
            onClick={() => onZoom?.(question.image, question.imageAlt || '')}
            aria-label={t('viewFullSize')}
            style={{
              display: 'block',
              width: '100%',
              padding: 0,
              border: '1px solid rgba(10,37,64,0.10)',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#ffffff',
              cursor: 'zoom-in',
              lineHeight: 0,
            }}
          >
            <img
              src={question.image}
              alt={question.imageAlt || ''}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 380,
                objectFit: 'contain',
                background: '#ffffff',
              }}
            />
          </button>
          {question.imageCaption && (
            <figcaption
              style={{
                margin: '8px 0 0',
                fontSize: 12.5,
                color: 'rgba(10,37,64,0.5)',
              }}
            >
              {question.imageCaption}
            </figcaption>
          )}
        </figure>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {question.displayOptions.map((opt, i) => {
          const isCorrect = locked && i === question.correct;
          const isChosenWrong = locked && i === chosen && i !== question.correct;
          const isHover = !locked && hover === i;

          let border = 'rgba(10,37,64,0.14)';
          let background = '#ffffff';
          let color = INK;
          let badgeBg = 'rgba(10,37,64,0.06)';
          let badgeColor = INK;
          let opacity = 1;

          if (isCorrect) {
            border = SUCCESS.border;
            background = SUCCESS.bg;
            color = INK;
            badgeBg = SUCCESS.solid;
            badgeColor = '#ffffff';
          } else if (isChosenWrong) {
            border = DANGER.border;
            background = DANGER.bg;
            color = INK;
            badgeBg = DANGER.solid;
            badgeColor = '#ffffff';
          } else if (locked) {
            // other options in a locked card recede
            opacity = 0.6;
          } else if (isHover) {
            border = ACCENT;
            background = '#f6f4ff';
          }

          return (
            <button
              key={`${opt.originalIndex}-${i}`}
              type="button"
              disabled={locked}
              // While answering, expose the 1–5 position to screen readers (it
              // backs the number-key shortcut); when locked, let the visible
              // option + answer tag form the accessible name instead.
              aria-label={locked ? undefined : `${t('optionPosition', { number: i + 1 })}: ${opt.text}`}
              onClick={() => !locked && onSelect?.(i)}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(-1)}
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
                color,
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
                }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{opt.text}</span>
              {isCorrect && <AnswerTag tone={SUCCESS}>{t('correctAnswer')}</AnswerTag>}
              {isChosenWrong && <AnswerTag tone={DANGER}>{t('yourAnswer')}</AnswerTag>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
