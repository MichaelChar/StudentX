'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import useModalA11y from '@/lib/useModalA11y';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Button from '@/components/ui/Button';

// Fixed reason set — must mirror ALLOWED_REASONS in
// src/app/api/listings/report/route.js and the report.reason* keys in en.json.
const REASONS = [
  'already_rented',
  'scam_fraud',
  'inaccurate_info',
  'inappropriate',
  'other',
];

const MAX_NOTE_LEN = 1000;

/**
 * "Report this listing" — a subtle trigger link + a small modal. Anyone
 * (signed in or not) can flag a listing; on submit it POSTs to
 * /api/listings/report and the ops inbox gets an email. Email-only v1, no DB.
 *
 * Rendered directly by the listing detail page (not inside a shared detail
 * component) so the trigger lives alongside the page, not the reusable parts.
 */
export default function ReportListingModal({ listingId }) {
  const t = useTranslations('propylaea.report');

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [error, setError] = useState('');

  const dialogRef = useRef(null);

  function close() {
    if (submitting) return;
    setOpen(false);
    // Reset for a clean next open. Safe — runs from an event handler, not
    // during render.
    setReason('');
    setNote('');
    setStatus('idle');
    setError('');
  }

  // Focus trap, Esc-to-close, scroll lock, focus restore — shared with every
  // other modal. Esc is suppressed while a submit is in flight (close() also
  // guards on `submitting`); the trap stays live.
  useModalA11y(dialogRef, {
    onClose: close,
    active: open,
    closeOnEscape: !submitting,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!reason) {
      setError(t('errorNoReason'));
      return;
    }
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/listings/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, reason, note: note.trim() || undefined }),
      });

      if (res.status === 429) {
        setStatus('error');
        setError(t('errorRateLimited'));
        return;
      }
      if (!res.ok) {
        setStatus('error');
        setError(t('errorGeneric'));
        return;
      }

      setStatus('success');
    } catch (err) {
      console.error('[ReportListingModal] report failed:', err);
      setStatus('error');
      setError(t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 label-caps text-night/40 hover:text-magenta transition-colors"
      >
        <Icon name="shield" className="w-3.5 h-3.5" />
        {t('trigger')}
      </button>

      {open && (
        <div
          ref={dialogRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('title')}
        >
          <div className="absolute inset-0 bg-night/60" onClick={close} />
          <Card tone="white" className="relative z-10 w-full max-w-lg p-6 md:p-8">
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <p className="font-display text-2xl text-night">{t('title')}</p>
                <p className="mt-1 text-sm text-night/60">{t('subtitle')}</p>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={submitting}
                className="p-1 text-night/60 hover:text-night disabled:opacity-50"
                aria-label={t('closeAriaLabel')}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>

            {status === 'success' ? (
              <div className="py-4">
                <p className="flex items-center gap-2 font-display text-lg text-night">
                  <Icon name="check" className="w-5 h-5 text-blue" />
                  {t('successTitle')}
                </p>
                <p className="mt-2 text-sm text-night/60">{t('successBody')}</p>
                <Button
                  type="button"
                  variant="primary"
                  onClick={close}
                  className="mt-5 w-full justify-center"
                >
                  {t('done')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <fieldset className="space-y-2.5">
                  <legend className="label-caps text-night/70 mb-1">
                    {t('reasonLegend')}
                  </legend>
                  {REASONS.map((r) => (
                    <label
                      key={r}
                      className="flex items-center gap-3 text-sm text-night/80 cursor-pointer"
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={r}
                        checked={reason === r}
                        onChange={() => setReason(r)}
                        className="h-4 w-4 accent-blue"
                      />
                      {t(`reason_${r}`)}
                    </label>
                  ))}
                </fieldset>

                <div>
                  <label
                    htmlFor="report-note"
                    className="label-caps text-night/70 block mb-1.5"
                  >
                    {t('noteLabel')}
                  </label>
                  <textarea
                    id="report-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t('notePlaceholder')}
                    maxLength={MAX_NOTE_LEN}
                    className="w-full rounded-sm border border-night/15 bg-stone/40 px-3.5 py-3 text-sm text-night focus:outline-none focus:ring-2 focus:ring-blue/20 focus:border-blue resize-none"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-sm px-3 py-2"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting}
                  className="w-full justify-center"
                >
                  {submitting ? t('submitting') : t('submit')}
                </Button>
              </form>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
