'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import FeedbackPanel from './FeedbackPanel';
import Lightbox from './Lightbox';
import ReportIssueModal from './ReportIssueModal';
import { PrimaryButton, TextButton } from './PlayerButton';

// Flashcard player for 'reveal'-type decks (e.g. the histology lab specimen and
// EM tests). Unlike the scored MCQ TestPlayer there are no options, no score and
// no resume: each card shows a prompt (the question's `stem`, or a fixed
// fallback for image-ID decks) with an optional image, and a big "Answer" button
// that reveals the answer from `explanation`. Kept deliberately separate so the
// scored player stays untouched.

const ACCENT = '#635BFF';
const INK = '#0a2540';
const COLUMN = 560;

function BackRow({ href, label }) {
  return (
    <Link
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(10,37,64,0.45)',
        textDecoration: 'none',
        letterSpacing: '-0.1px',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1 }}>
        ←
      </span>{' '}
      {label}
    </Link>
  );
}

function Shell({ back, children }) {
  return (
    <div>
      <div style={{ maxWidth: COLUMN, margin: '0 auto', padding: '56px 24px 0' }}>{back}</div>
      <section
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 24px 64px' }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN }}>{children}</div>
      </section>
    </div>
  );
}

// Full-width iris CTA used for "Answer". Mirrors PlayerButton's lift/shadow.
function AnswerButton({ children, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: 'none',
        border: 'none',
        width: '100%',
        borderRadius: 14,
        padding: '18px 24px',
        background: ACCENT,
        color: '#ffffff',
        fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
        fontWeight: 600,
        fontSize: 17,
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        boxShadow: hover
          ? '0 18px 40px -16px rgba(99,91,255,0.55), 0 6px 16px -10px rgba(10,37,64,0.18)'
          : '0 10px 26px -14px rgba(99,91,255,0.45)',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        transition: 'transform 200ms cubic-bezier(.2,.7,.2,1), box-shadow 200ms ease',
      }}
    >
      {children}
    </button>
  );
}

export default function FlashcardPlayer({ test, subject, onReportIssue }) {
  const t = useTranslations('student.practice.player');
  const listHref = `/student/ausom/semester-2/${subject}`;

  const total = test.questions.length;
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [finished, setFinished] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { src, alt } | null
  const [reportCtx, setReportCtx] = useState(null);

  const q = test.questions[current];

  const openLightbox = useCallback((src, alt) => setLightbox({ src, alt }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const closeReport = useCallback(() => setReportCtx(null), []);

  const handleReveal = useCallback(() => setRevealed(true), []);

  const handleNext = useCallback(() => {
    setRevealed(false);
    if (current < total - 1) {
      setCurrent((c) => c + 1);
      if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
    } else {
      setFinished(true);
    }
  }, [current, total]);

  const handleRestart = useCallback(() => {
    setCurrent(0);
    setRevealed(false);
    setFinished(false);
  }, []);

  const handleReport = useCallback(() => {
    const ctx = { subject, testId: test.id, questionId: q.id, version: test.version };
    if (onReportIssue) {
      onReportIssue(ctx);
      return;
    }
    setReportCtx({ subject: ctx.subject, testId: ctx.testId, questionId: ctx.questionId, testVersion: ctx.version });
  }, [onReportIssue, subject, test.id, test.version, q.id]);

  // Keyboard: Enter / Space reveals the card, then advances. Disabled while a
  // modal or the lightbox is open, on the completion screen, or when typing.
  useEffect(() => {
    if (finished || lightbox || reportCtx) return undefined;
    function onKey(e) {
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (revealed) handleNext();
        else handleReveal();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finished, lightbox, reportCtx, revealed, handleNext, handleReveal]);

  const lightboxEl = lightbox ? (
    <Lightbox
      src={lightbox.src}
      alt={lightbox.alt}
      label={t('flashcard.imageLabel')}
      closeLabel={t('closeLightbox')}
      onClose={closeLightbox}
    />
  ) : null;

  const reportEl = reportCtx ? (
    <ReportIssueModal
      subject={reportCtx.subject}
      testId={reportCtx.testId}
      questionId={reportCtx.questionId}
      testVersion={reportCtx.testVersion}
      onClose={closeReport}
    />
  ) : null;

  // Completion screen.
  if (finished) {
    return (
      <>
        <Shell back={<BackRow href={listHref} label={t('review.backToTests')} />}>
          <div
            style={{
              borderRadius: 22,
              border: '1px solid rgba(99,91,255,0.25)',
              background: '#f6f4ff',
              padding: '28px 24px',
              textAlign: 'center',
            }}
          >
            <h2
              style={{
                fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: '-0.01em',
                color: INK,
                margin: '0 0 8px',
              }}
            >
              {t('flashcard.completeTitle')}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.5, color: 'rgba(10,37,64,0.6)' }}>
              {t('flashcard.completeBody', { total })}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
              <PrimaryButton onClick={handleRestart}>{t('flashcard.restart')}</PrimaryButton>
            </div>
          </div>
        </Shell>
        {lightboxEl}
      </>
    );
  }

  const progressPct = ((current + (revealed ? 1 : 0)) / total) * 100;

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
              {t('flashcard.cardProgress', { current: current + 1, total })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t('progressBarLabel')}
            aria-valuenow={current + (revealed ? 1 : 0)}
            aria-valuemin={0}
            aria-valuemax={total}
            style={{ height: 6, borderRadius: 999, background: 'rgba(10,37,64,0.08)', overflow: 'hidden' }}
          >
            <div
              style={{
                height: '100%',
                width: `${progressPct}%`,
                background: ACCENT,
                borderRadius: 999,
                transition: 'width 280ms cubic-bezier(.2,.7,.2,1)',
              }}
            />
          </div>
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
            color: INK,
            margin: '0 0 20px',
          }}
        >
          {q.stem || t('flashcard.prompt')}
        </h2>

        {q.image && (
          <figure style={{ margin: '0 0 20px' }}>
            <button
              type="button"
              onClick={() => openLightbox(q.image, q.imageAlt || '')}
              aria-label={t('viewFullSize')}
              style={{
                display: 'block',
                width: '100%',
                padding: 0,
                border: '1px solid rgba(10,37,64,0.10)',
                borderRadius: 14,
                overflow: 'hidden',
                background: '#ffffff',
                cursor: 'zoom-in',
                lineHeight: 0,
              }}
            >
              <img
                src={q.image}
                alt={q.imageAlt || ''}
                style={{ display: 'block', width: '100%', maxHeight: 460, objectFit: 'contain', background: '#ffffff' }}
              />
            </button>
            {q.imageCaption && (
              <figcaption style={{ margin: '10px 0 0', fontSize: 12.5, color: 'rgba(10,37,64,0.5)' }}>
                {q.imageCaption}
              </figcaption>
            )}
          </figure>
        )}

        {!revealed && <AnswerButton onClick={handleReveal}>{t('flashcard.answer')}</AnswerButton>}

        {revealed && <FeedbackPanel explanation={q.explanation} result={null} onZoom={openLightbox} t={t} />}

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
          <TextButton onClick={handleReport}>{t('reportIssue')}</TextButton>
          {revealed && (
            <PrimaryButton onClick={handleNext}>
              {current === total - 1 ? t('flashcard.finish') : t('flashcard.next')}
            </PrimaryButton>
          )}
        </div>
      </Shell>
      {lightboxEl}
      {reportEl}
    </>
  );
}
