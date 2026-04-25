'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export default function InquiryForm({ listingId, facultyId }) {
  const t = useTranslations('inquiry');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    student_name: '',
    student_email: '',
    student_phone: '',
    message: '',
    website: '', // honeypot — must stay empty for real users
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: listingId,
          student_name: form.student_name,
          student_email: form.student_email,
          student_phone: form.student_phone || undefined,
          message: form.message,
          faculty_id: facultyId || undefined,
          website: form.website,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('genericError'));
        return;
      }

      setSuccess(true);
    } catch {
      setError(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
        <svg
          className="w-8 h-8 text-green-500 mx-auto mb-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <p className="font-heading font-semibold text-green-800 text-sm">{t('successTitle')}</p>
        <p className="text-green-700/70 text-xs mt-1">
          {t('successDesc')}
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-navy text-white font-heading font-semibold px-6 py-3.5 rounded-lg hover:bg-navy/90 transition-colors tracking-wide cursor-pointer"
      >
        {t('contactLandlord')}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-navy text-sm uppercase tracking-wider">
          {t('sendMessage')}
        </h3>
        <button
          onClick={() => setOpen(false)}
          aria-label={t('close')}
          className="text-gray-dark/40 hover:text-gray-dark transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Honeypot — hidden from real users; bots fill every field */}
        <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
          <label htmlFor="inquiry-website">Website</label>
          <input
            id="inquiry-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={handleChange}
          />
        </div>

        <div>
          <label htmlFor="inquiry-name" className="sr-only">{t('yourName')}</label>
          <input
            id="inquiry-name"
            name="student_name"
            type="text"
            required
            placeholder={t('namePlaceholder')}
            value={form.student_name}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
          />
        </div>

        <div>
          <label htmlFor="inquiry-email" className="sr-only">{t('yourEmail')}</label>
          <input
            id="inquiry-email"
            name="student_email"
            type="email"
            required
            placeholder={t('emailPlaceholder')}
            value={form.student_email}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
          />
        </div>

        <div>
          <label htmlFor="inquiry-phone" className="sr-only">{t('phoneOptional')}</label>
          <input
            id="inquiry-phone"
            name="student_phone"
            type="tel"
            placeholder={t('phonePlaceholder')}
            value={form.student_phone}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold"
          />
        </div>

        <div>
          <label htmlFor="inquiry-message" className="sr-only">{t('message')}</label>
          <textarea
            id="inquiry-message"
            name="message"
            required
            rows={4}
            placeholder={t('messagePlaceholder')}
            value={form.message}
            onChange={handleChange}
            minLength={10}
            className="w-full rounded-lg border border-gray-200 bg-gray-light px-3.5 py-2.5 text-sm text-gray-dark placeholder:text-gray-dark/40 focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold resize-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-navy text-white font-heading font-semibold px-6 py-3 rounded-lg hover:bg-navy/90 transition-colors tracking-wide cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? t('sending') : t('sendMessageBtn')}
        </button>
      </form>
    </div>
  );
}
