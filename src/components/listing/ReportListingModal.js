'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import ResponsiveDialog from '@/components/ui/ResponsiveDialog';
import Icon from '@/components/ui/Icon';
import IconButton from '@/components/ui/IconButton';
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
 * "Report this listing" — a subtle trigger link plus a dialog. Anyone (signed
 * in or not) can flag a listing; on submit it POSTs to /api/listings/report and
 * the ops inbox gets an email. Email-only v1, no DB.
 *
 * Rendered directly by the listing detail page (not inside a shared detail
 * component) so the trigger lives alongside the page, not the reusable parts.
 *
 * RESTYLE — parity Feature 41. Only the presentation changed; the reason set,
 * the request and the states are the same. It was the last hand-rolled overlay
 * on the PDP: its own `fixed inset-0`, its own `night/60` scrim, its own
 * `useModalA11y` call and a `Card` at 20px radii, sitting inside a page that
 * had moved to 32px `rounded-modal` and a `night/40` blurred scrim. That is
 * what the spec meant by "old geometry inside a new PDP", and it was never
 * going to resolve itself by waiting — the deferral was gated on the redesign
 * shipping, which it now has.
 *
 * The dialog is a bottom sheet on a phone and a centre modal on desktop, which
 * is `ResponsiveDialog`'s whole job. Focus trap, scroll lock, Escape, the
 * scrim and the history entry come from the primitives beneath it, so the
 * local `useModalA11y` wiring is gone.
 *
 * WORTH MORE THAN PARITY, recorded in the spec: this is the cheapest
 * fraud-detection channel available. §W4 of the marketplace spec notes the
 * video call confirms the room exists but not the building, the neighbours, or
 * that keys are handed over — and escrow means StudentX pays the refund on a
 * misrepresented listing. A report that arrives pre-booking is worth money.
 */
export default function ReportListingModal({ listingId }) {
  const t = useTranslations('propylaea.report');
  const titleId = useId();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('idle'); // 'idle' | 'success' | 'error'
  const [error, setError] = useState('');

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
        className="inline-flex items-center gap-1.5 label-caps text-night/40 hover:text-magenta active:text-magenta/80 transition-colors"
      >
        <Icon name="shield" className="w-3.5 h-3.5" />
        {t('trigger')}
      </button>

      {/*
        `closeOnBackdrop` is left at its default. An accidental backdrop tap
        loses at most a radio choice and a note the student has not sent, and
        the primitives already refuse to close while `submitting` is not the
        thing guarding it — `close()` is.
      */}
      <ResponsiveDialog open={open} onClose={close} aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="font-display text-2xl text-night leading-tight">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-night/60">{t('subtitle')}</p>
          </div>
          <IconButton
            label={t('closeAriaLabel')}
            size="sm"
            variant="ghost"
            onClick={close}
            disabled={submitting}
          >
            <Icon name="x" className="w-4 h-4" />
          </IconButton>
        </div>

        {status === 'success' ? (
          <div className="mt-6">
            <p className="flex items-center gap-2 font-display text-lg text-night">
              <Icon name="check" className="w-5 h-5 text-blue" />
              {t('successTitle')}
            </p>
            <p className="mt-2 text-sm text-night/60">{t('successBody')}</p>
            <Button
              type="button"
              variant="primary"
              onClick={close}
              className="mt-6 w-full justify-center"
            >
              {t('done')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-6">
            <fieldset>
              <legend className="label-caps text-night/70 mb-2">
                {t('reasonLegend')}
              </legend>
              {/*
                Each reason is a full-width row rather than a bare inline
                radio. The whole row is the <label>, so the tap area is the row
                and not the 16px control — the old inline labels were the
                height of the text.

                `py-3` rather than `py-2.5`: measured at 40px, which is under
                the 44px minimum touch target, and this is a bottom sheet on a
                phone now.
              */}
              <div className="space-y-1">
                {REASONS.map((r) => (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-3 rounded-control px-3 py-3 text-sm transition-colors ${
                      reason === r
                        ? 'bg-parchment text-night'
                        : 'text-night/80 hover:bg-parchment/60'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      className="h-4 w-4 shrink-0 accent-blue"
                    />
                    {t(`reason_${r}`)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor="report-note"
                className="label-caps text-night/70 block mb-1.5"
              >
                {t('noteLabel')}
              </label>
              {/*
                `bg-parchment`, matching every other textarea on this page. It
                was `bg-stone/40` — white at 40% on a white card, i.e. a field
                with no fill at all, which is only invisible rather than wrong
                while the surface behind it happens to be white too.
              */}
              <textarea
                id="report-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('notePlaceholder')}
                maxLength={MAX_NOTE_LEN}
                className="w-full resize-none rounded-control border border-night/15 bg-parchment px-3.5 py-3 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/20"
              />
            </div>

            {/*
              Magenta on parchment, the repo's error treatment (see
              StudentProfileForm and the booking widget). It was Tailwind's
              default `red-700 / red-50 / red-200`, which is not in the palette
              at all — CLAUDE.md gives magenta as the attention/error accent.

              Only this file is changed. Nine other landlord-side surfaces
              carry the same default reds; sweeping them is its own task, not
              a restyle of one dialog.
            */}
            {error && (
              <p
                role="alert"
                className="rounded-control border border-night/10 bg-parchment px-3 py-2 text-sm text-magenta"
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
      </ResponsiveDialog>
    </>
  );
}
