'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import useModalA11y from '@/lib/useModalA11y';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import { PrimaryButton } from './PlayerButton';

const ACCENT = '#635BFF';
const INK = '#0a2540';
const MESSAGE_MIN = 5;
const MESSAGE_MAX = 2000;

// The edit-loop entry point (PLAN.md §3/§4). Inserts one row into
// public.question_reports via the ANON browser client. The security model is
// anon-key + insert-only RLS: this component only ever INSERTs — it never reads
// the table back. `proposed_change` and `reporter_email` are omitted entirely
// when blank so the DB stores NULL rather than an empty string.
export default function ReportIssueModal({ subject, testId, questionId, testVersion, onClose }) {
  const t = useTranslations('student.practice.report');

  const [kind, setKind] = useState('error');
  const [message, setMessage] = useState('');
  const [proposedChange, setProposedChange] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — humans never see it
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const [done, setDone] = useState(false);

  const dialogRef = useRef(null);
  const firstFieldRef = useRef(null);

  // Focus trap, Esc-to-close, scroll lock, initial focus on the first field,
  // and focus restore — shared with every other modal.
  useModalA11y(dialogRef, { onClose, initialFocusRef: firstFieldRef });

  const trimmedMessage = message.trim();
  const canSubmit = !submitting && trimmedMessage.length >= MESSAGE_MIN;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    // Honeypot: a filled "website" field means a bot. Show the same success
    // state, but never touch the database.
    if (website.trim() !== '') {
      setDone(true);
      return;
    }

    setSubmitting(true);
    setError(false);
    try {
      const row = {
        subject,
        test_id: testId,
        question_id: questionId,
        test_version: testVersion,
        kind,
        message: trimmedMessage,
      };
      if (kind === 'edit' && proposedChange.trim() !== '') {
        row.proposed_change = proposedChange.trim();
      }
      if (email.trim() !== '') {
        row.reporter_email = email.trim();
      }

      const supabase = getSupabaseBrowser();
      // Insert only — no .select(). Anon may write but never read this table.
      const { error: insertError } = await supabase.from('question_reports').insert(row);
      if (insertError) {
        setError(true);
      } else {
        setDone(true);
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(10,37,64,0.5)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          background: '#ffffff',
          borderRadius: 22,
          boxShadow: '0 30px 80px -24px rgba(10,37,64,0.45)',
          padding: '26px 26px 24px',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            appearance: 'none',
            border: 'none',
            background: 'rgba(10,37,64,0.05)',
            borderRadius: 999,
            width: 32,
            height: 32,
            cursor: 'pointer',
            color: 'rgba(10,37,64,0.55)',
            fontSize: 17,
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        {done ? (
          <div style={{ padding: '12px 0 4px' }}>
            <h2
              style={{
                fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 20,
                letterSpacing: '-0.01em',
                color: INK,
                margin: '0 0 8px',
              }}
            >
              {t('successTitle')}
            </h2>
            <p style={{ margin: '0 0 20px', fontSize: 14.5, lineHeight: 1.55, color: 'rgba(10,37,64,0.6)' }}>
              {t('successBody')}
            </p>
            <PrimaryButton onClick={onClose}>{t('done')}</PrimaryButton>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2
              style={{
                fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                fontWeight: 600,
                fontSize: 20,
                letterSpacing: '-0.01em',
                color: INK,
                margin: '0 26px 18px 0',
              }}
            >
              {t('title')}
            </h2>

            {/* kind toggle */}
            <div
              role="group"
              aria-label={t('title')}
              style={{
                display: 'flex',
                gap: 8,
                padding: 4,
                background: '#f6f4ff',
                borderRadius: 14,
                marginBottom: 18,
              }}
            >
              {[
                { value: 'error', label: t('kindError') },
                { value: 'edit', label: t('kindEdit') },
              ].map((opt) => {
                const active = kind === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(opt.value)}
                    style={{
                      flex: 1,
                      appearance: 'none',
                      border: 'none',
                      borderRadius: 11,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                      fontWeight: 600,
                      fontSize: 14,
                      letterSpacing: '-0.01em',
                      color: active ? '#ffffff' : 'rgba(10,37,64,0.6)',
                      background: active ? ACCENT : 'transparent',
                      boxShadow: active ? '0 8px 20px -12px rgba(99,91,255,0.7)' : 'none',
                      transition: 'background 160ms ease, color 160ms ease',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* message */}
            <label style={labelStyle} htmlFor="report-message">
              {t('messageLabel')}
            </label>
            <textarea
              id="report-message"
              ref={firstFieldRef}
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder={t('messagePlaceholder')}
              rows={4}
              maxLength={MESSAGE_MAX}
              required
              style={textareaStyle}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                margin: '6px 2px 16px',
                fontSize: 12.5,
                color: 'rgba(10,37,64,0.45)',
              }}
            >
              <span>{t('messageHint')}</span>
              <span aria-live="polite">{t('charCount', { count: message.length, max: MESSAGE_MAX })}</span>
            </div>

            {/* proposed_change — only for an edit */}
            {kind === 'edit' && (
              <>
                <label style={labelStyle} htmlFor="report-change">
                  {t('proposedChangeLabel')}
                </label>
                <textarea
                  id="report-change"
                  value={proposedChange}
                  onChange={(e) => setProposedChange(e.target.value.slice(0, MESSAGE_MAX))}
                  placeholder={t('proposedChangePlaceholder')}
                  rows={3}
                  maxLength={MESSAGE_MAX}
                  style={{ ...textareaStyle, marginBottom: 16 }}
                />
              </>
            )}

            {/* optional email */}
            <label style={labelStyle} htmlFor="report-email">
              {t('emailLabel')}
            </label>
            <input
              id="report-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              style={inputStyle}
            />
            <div style={{ margin: '6px 2px 18px', fontSize: 12.5, color: 'rgba(10,37,64,0.45)' }}>
              {t('emailHint')}
            </div>

            {/* honeypot — hidden from humans, tempting to bots */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            {error && (
              <p
                role="alert"
                style={{
                  margin: '0 0 14px',
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(255,95,162,0.1)',
                  color: '#b3265f',
                  fontSize: 13.5,
                  lineHeight: 1.45,
                }}
              >
                {t('error')}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  appearance: 'none',
                  border: 'none',
                  borderRadius: 14,
                  padding: '14px 24px',
                  background: ACCENT,
                  color: '#ffffff',
                  fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
                  fontWeight: 600,
                  fontSize: 15.5,
                  letterSpacing: '-0.01em',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: canSubmit ? 1 : 0.5,
                  boxShadow: '0 10px 26px -14px rgba(99,91,255,0.45)',
                  transition: 'opacity 160ms ease',
                }}
              >
                {submitting ? t('submitting') : t('submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontFamily: 'var(--font-inter-tight, var(--font-inter), system-ui, sans-serif)',
  fontWeight: 600,
  fontSize: 13.5,
  letterSpacing: '-0.01em',
  color: INK,
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
  border: '1px solid rgba(10,37,64,0.14)',
  borderRadius: 12,
  padding: '12px 14px',
  fontSize: 14.5,
  fontFamily: 'var(--font-inter, system-ui, sans-serif)',
  color: INK,
  background: '#ffffff',
  // No `outline: 'none'` — inline styles beat the stylesheet, so it would
  // suppress the global :focus-visible iris ring and leave keyboard users with
  // no visible focus on these fields (WCAG 2.4.7). Let the global ring show. (QA, P7.)
};

const textareaStyle = {
  ...inputStyle,
  resize: 'vertical',
  lineHeight: 1.5,
};
