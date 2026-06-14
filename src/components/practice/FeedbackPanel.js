'use client';

// Explanation panel shown after a question is answered (and in review mode).
//
// Render rules (PLAN.md P3):
//   - explanation.image set  → screenshot (max-height ~320px, click opens a
//     lightbox), then caption (normal text) and source (muted, smaller).
//   - explanation.text set   → the text.
//   - image and text are NOT mutually exclusive — show both when both are set,
//     image first, text below.
// `result` ('correct' | 'incorrect' | null) drives an optional status header;
// null in the admin deep-link review where there is no chosen answer.

const INK = '#0a2540';

// Green darkened from #0f7a3d → #0d7038 so the "Correct" pill text clears WCAG
// AA (4.5:1): on this 0.12-alpha green pill over parchment the lighter green was
// 4.38:1. #0d7038 is 5.0:1 and visually near-identical. (QA, P7.)
const SUCCESS = { text: '#0d7038', bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.32)' };
const DANGER = { text: '#b42318', bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.30)' };

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
         strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function FeedbackPanel({ explanation, result, onZoom, t }) {
  const { image, imageAlt, caption, source, text } = explanation || {};
  const tone = result === 'correct' ? SUCCESS : result === 'incorrect' ? DANGER : null;

  return (
    <div
      style={{
        marginTop: 18,
        borderRadius: 18,
        border: '1px solid rgba(10,37,64,0.08)',
        background: '#f6f4ff',
        padding: 18,
      }}
    >
      {tone && (
        <div
          role="status"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '5px 12px',
            borderRadius: 999,
            background: tone.bg,
            border: `1px solid ${tone.border}`,
            color: tone.text,
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 14,
          }}
        >
          {result === 'correct' ? <CheckIcon /> : <CrossIcon />}
          {result === 'correct' ? t('resultCorrect') : t('resultIncorrect')}
        </div>
      )}

      {image && (
        <figure style={{ margin: 0 }}>
          <button
            type="button"
            onClick={() => onZoom(image, imageAlt || '')}
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
              src={image}
              alt={imageAlt || ''}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 320,
                objectFit: 'contain',
                background: '#ffffff',
              }}
            />
          </button>
          {caption && (
            <figcaption
              style={{
                margin: '12px 0 0',
                fontSize: 14.5,
                lineHeight: 1.5,
                color: INK,
              }}
            >
              {caption}
            </figcaption>
          )}
          {source && (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'rgba(10,37,64,0.5)' }}>
              {source}
            </p>
          )}
        </figure>
      )}

      {text && (
        <p
          style={{
            margin: image ? '14px 0 0' : 0,
            fontSize: 14.5,
            lineHeight: 1.55,
            color: INK,
          }}
        >
          {text}
        </p>
      )}
    </div>
  );
}
