'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function SaveSearchModal({ filters, faculty, onClose }) {
  const t = useTranslations('saveSearch');
  const [form, setForm] = useState({ email: '', label: '', frequency: 'daily' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const filtersPayload = {
      faculty: faculty || undefined,
      minBudget: filters.minBudget || undefined,
      maxBudget: filters.maxBudget || undefined,
      types: filters.selectedTypes?.length > 0 ? filters.selectedTypes : undefined,
      neighborhoods: filters.selectedNeighborhoods?.length > 0 ? filters.selectedNeighborhoods : undefined,
      amenities: filters.selectedAmenities?.length > 0 ? filters.selectedAmenities : undefined,
      minDuration: filters.minDuration || undefined,
    };

    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          label: form.label || undefined,
          filters: filtersPayload,
          frequency: form.frequency,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('errorGeneric'));
      } else {
        setSuccess(true);
      }
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 z-10">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="font-heading text-xl font-bold text-navy">{t('title')}</h2>
            <p className="text-sm text-gray-dark/60 mt-0.5">{t('desc')}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-dark/40 hover:text-gray-dark/70 transition-colors cursor-pointer ml-4 shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-heading text-lg font-semibold text-navy mb-1">{t('successTitle')}</p>
            <p className="text-sm text-gray-dark/60">{t('successDesc')}</p>
            <button
              onClick={onClose}
              className="mt-5 w-full py-2.5 rounded-lg bg-navy text-white font-heading font-semibold text-sm hover:bg-navy/90 transition-colors cursor-pointer"
            >
              {t('done')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-1.5">
                {t('emailLabel')} <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                placeholder={t('emailPlaceholder')}
                className="w-full rounded-lg border border-gray-200 bg-gray-light px-3 py-2.5 text-sm text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-1.5">
                {t('labelLabel')}
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder={t('labelPlaceholder')}
                maxLength={80}
                className="w-full rounded-lg border border-gray-200 bg-gray-light px-3 py-2.5 text-sm text-gray-dark focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
              />
            </div>

            <div>
              <label className="block uppercase tracking-wider text-xs font-heading font-semibold text-gray-dark/50 mb-1.5">
                {t('frequencyLabel')}
              </label>
              <div className="flex gap-2">
                {['daily', 'weekly'].map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, frequency: freq }))}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-colors cursor-pointer ${form.frequency === freq ? 'border-gold bg-gold/10 text-gold font-medium' : 'border-gray-200 text-gray-dark/60 hover:border-gold/40'}`}
                  >
                    {t(freq)}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-lg bg-gold text-white font-heading font-semibold text-sm hover:bg-gold/90 transition-colors cursor-pointer disabled:opacity-60"
            >
              {submitting ? t('saving') : t('submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
